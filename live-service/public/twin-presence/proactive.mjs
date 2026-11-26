import { startAmbientAudio } from './ambient-audio.mjs';
import { createPresenceDetector, createPresenceTracker } from './camera-detector.mjs';

export function deliveryMode({ paused, pending, editing, visible, present, relevant = true, configuring = false }) {
  if (paused || !pending || configuring) return 'quiet';
  return visible && !editing && present && relevant ? 'preview' : 'badge';
}

export function isQuietTime(start, end, now = new Date()) {
  if (!start || !end || start === end) return false;
  const clock = [now.getHours(), now.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
  return start < end ? clock >= start && clock < end : clock >= start || clock < end;
}

export function changedLines(previous, current) {
  const before = previous.split(/\r?\n/);
  const after = current.split(/\r?\n/);
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }
  const section = (from, endBefore, endAfter, afterFrom = from) => ({
    start: from + 1,
    ...(afterFrom !== from ? { currentStart: afterFrom + 1 } : {}),
    previousCount: endBefore - from,
    currentCount: endAfter - afterFrom,
    removed: before.slice(from, endBefore).join('\n'),
    added: after.slice(afterFrom, endAfter).join('\n'),
  });
  const result = section(start, beforeEnd, afterEnd);
  if (beforeEnd !== afterEnd) {
    const rows = beforeEnd - start;
    const columns = afterEnd - start;
    const stride = columns + 1;
    if (!rows || !columns || (rows + 1) * stride > 160000) return result;
    // Align unchanged lines in the bounded changed range.
    const lengths = new Uint16Array((rows + 1) * stride);
    for (let row = rows - 1; row >= 0; row--) {
      for (let column = columns - 1; column >= 0; column--) {
        const cell = row * stride + column;
        lengths[cell] = before[start + row] === after[start + column]
          ? 1 + lengths[cell + stride + 1]
          : Math.max(lengths[cell + stride], lengths[cell + 1]);
      }
    }
    const sections = [];
    let row = 0, column = 0;
    let fromBefore = start, fromAfter = start;
    while (row < rows && column < columns) {
      if (before[start + row] === after[start + column]) {
        if (fromBefore !== start + row || fromAfter !== start + column) {
          sections.push(section(fromBefore, start + row, start + column, fromAfter));
          if (sections.length === 24) return result;
        }
        fromBefore = start + ++row;
        fromAfter = start + ++column;
      } else if (lengths[(row + 1) * stride + column] >= lengths[row * stride + column + 1]) row++;
      else column++;
    }
    if (fromBefore < beforeEnd || fromAfter < afterEnd) sections.push(section(fromBefore, beforeEnd, afterEnd, fromAfter));
    return sections.length > 1 ? { ...result, sections } : result;
  }
  const sections = [];
  let from = start;
  for (let line = start; line < beforeEnd; line++) {
    if (before[line] !== after[line]) continue;
    if (from < line) sections.push(section(from, line, line));
    if (sections.length === 24) return result;
    from = line + 1;
  }
  if (from < beforeEnd) sections.push(section(from, beforeEnd, afterEnd));
  return sections.length > 1 ? { ...result, sections } : result;
}

// An explicit, local, read-only watch. There is no upload or model training.
export function mountProactive(anchor) {
  const workspace = anchor.closest('.twin-root');
  const panel = document.createElement('section');
  const controller = new AbortController();
  const { signal } = controller;
  let example = false;
  let reportedSource;
  let handle, manualSource, baseline, result, supplemental, previousSupplemental, stream, audio, frameTimer;
  let paused = false;
  let present = true;
  let detector;
  let cameraState = 'off';
  let cameraError = '';
  let cameraEpoch = 0;
  const cameraControl = document.createElement('div');
  cameraControl.className = 'tp-camera-control';
  const cameraLabel = document.createElement('span');
  cameraLabel.setAttribute('role', 'status');
  const cameraButton = document.createElement('button');
  cameraButton.type = 'button';
  cameraButton.addEventListener('click', () => void toggleCamera());
  cameraControl.append(cameraLabel, cameraButton);
  cameraControl.title = 'Detects presence on this device without recording audio.';
  function cameraDisplay() {
    cameraControl.dataset.state = cameraState;
    cameraLabel.textContent = {
      off: 'Camera off',
      starting: 'Starting local presence detection…',
      waiting: 'Waiting for you to return',
      present: 'Presence detected',
      background: 'Camera stopped when the page left the foreground',
      denied: cameraError || 'Camera unavailable. Workspace alerts are still available.',
    }[cameraState];
    cameraButton.textContent = stream ? 'Turn off camera' : 'Enable camera';
    cameraButton.disabled = cameraState === 'starting' || paused;
  }
  let settings = false;
  let dismissed = false;
  let lastCue;
  let busy = false;
  let opened = false;
  let lastMode;
  let revision = 0;
  let error = '';
  let sourceError = '';
  let reportedSourceError;
  let quiet = false;
  let ambientLevel = 'off';
  let closeAmbient;
  let ambientEpoch = 0;
  function stopAmbient() {
    ambientEpoch++;
    closeAmbient?.();
    closeAmbient = undefined;
    ambientLevel = 'off';
  }
  async function toggleAmbient() {
    if (ambientLevel !== 'off') { stopAmbient(); render(); return; }
    if (paused || !navigator.mediaDevices?.getUserMedia || typeof AudioContext !== 'function') {
      error = 'Volume detection is unavailable. Workspace alerts still appear visually.';
      render();
      return;
    }
    const epoch = ++ambientEpoch;
    ambientLevel = 'unknown';
    try {
      const close = await startAmbientAudio(level => {
        if (epoch !== ambientEpoch) return;
        if (level === 'stopped') {
          stopAmbient();
          render();
          workspace.dispatchEvent(new Event('twin:sensor-stopped'));
        } else ambientLevel = level;
      });
      if (epoch !== ambientEpoch || signal.aborted || document.hidden) { close(); return; }
      closeAmbient = close;
      error = '';
    } catch {
      if (epoch !== ambientEpoch) return;
      stopAmbient();
      error = 'Microphone access is unavailable. Workspace alerts still appear visually.';
    }
    render();
  }
  const quietHoursKey = 'loka-twin-quiet-hours';
  let quietStart = '', quietEnd = '';
  try {
    const savedHours = window.localStorage.getItem(quietHoursKey);
    if (/^(?:[01]\d|2[0-3]):[0-5]\d,(?:[01]\d|2[0-3]):[0-5]\d$/.test(savedHours || '')) {
      [quietStart, quietEnd] = savedHours.split(',');
    }
  } catch {
    // Quiet hours are available for this tab even when storage is disabled.
  }
  const initialItem = workspace.querySelector('[data-twin-item][aria-pressed="true"]');
  let related = !initialItem || initialItem.dataset.twinItem === 'source';
  let configuring = false;
  let composing = false;
  let arrival, pendingFrom, draftText = '', draftSource = '', draftSection = 0;
  const isForeground = () => !document.hidden && document.hasFocus();
  const isEditing = () => composing || Boolean(document.activeElement?.closest(
    '.vcomposer, .tp-docked-review input, .tp-docked-review textarea, [contenteditable]:not([contenteditable=false]), textarea, [role=textbox]'
  ));
  const isRelated = () => {
    const tab = workspace.querySelector('.dockx .tabs .tab.on');
    return related && (!tab || /^(?:预览|预览台|Preview)$/i.test(tab.textContent.trim()));
  };

  panel.className = 'tp-follow';
  anchor.after(cameraControl, panel);

  const stopCamera = (next = 'off') => {
    cameraEpoch++;
    detector?.close();
    detector = undefined;
    cameraState = next;
    clearInterval(frameTimer);
    stream?.getTracks().forEach(track => track.stop());
    stream = undefined;
    present = true;
  };
  const cue = () => {
    if (audio?.state !== 'running') return;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = 480;
    gain.gain.value = 0.035;
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.12);
  };
  async function read(file) {
    if (file.size > 256 * 1024 || !/\.(md|txt)$/i.test(file.name)) throw new Error('Choose a TXT or Markdown file under 256 KB.');
    const text = await file.text();
    if (text.includes('\0')) throw new Error('Could not read this file as plain text.');
    return text;
  }
  async function chooseSource() {
    if (!window.showOpenFilePicker) {
      return 'manual';
    }
    const ticket = ++revision;
    render();
    try {
      const [selected] = await window.showOpenFilePicker({
        types: [{ description: 'Text files', accept: { 'text/plain': ['.txt', '.md'] } }],
        excludeAcceptAllOption: true,
      });
      const text = await read(await selected.getFile());
      if (signal.aborted || ticket !== revision) return;
      example = false;
      handle = selected;
      manualSource = undefined;
      baseline = text;
      result = supplemental = previousSupplemental = lastCue = arrival = pendingFrom = undefined;
      draftText = draftSource = '';
      paused = dismissed = opened = false;
      sourceError = '';
      settings = false;
      render();
      return 'selected';
    } catch (cause) {
      if (signal.aborted || ticket !== revision || cause.name === 'AbortError') return;
      if (cause.name === 'SecurityError' || cause.name === 'NotSupportedError') return 'manual';
      sourceError = cause.name === 'NotAllowedError' ? 'File access was denied. Choose the file again.' : cause.message;
    }
    if (!signal.aborted) render();
  }
  async function chooseSnapshot(file, compare = false) {
    const ticket = ++revision;
    sourceError = '';
    try {
      const text = await read(file);
      if (signal.aborted || ticket !== revision) return;
      if (compare && manualSource) {
        if (paused) throw new Error('Resume watching first.');
        if (file.name !== manualSource) throw new Error('Choose a newer file with the same name to compare.');
        if (!acceptFileVersion(text)) sourceError = 'This matches the version you last selected.';
      } else {
        example = false;
        handle = undefined;
        manualSource = file.name;
        baseline = text;
        result = supplemental = previousSupplemental = lastCue = arrival = pendingFrom = undefined;
        draftText = draftSource = '';
        paused = dismissed = opened = false;
      }
      render();
      return true;
    } catch (cause) {
      if (!signal.aborted && ticket === revision) sourceError = cause.message;
    }
    if (!signal.aborted) render();
  }

  async function toggleSound() {
    if (audio) {
      stopAmbient();
      await audio.close();
      audio = undefined;
    } else {
      try {
        audio = new AudioContext();
        await audio.resume();
        cue();
      } catch {
        error = 'Sound is unavailable. Results still appear in the workspace.';
      }
    }
    render();
  }
  async function toggleCamera() {
    if (stream) { stopCamera(); render(); return; }
    if (paused || !navigator.mediaDevices?.getUserMedia) {
      cameraState = 'denied';
      cameraError = error = window.isSecureContext
        ? 'The camera is unavailable. Results still appear in the workspace.'
        : 'The camera requires HTTPS or a secure local address. Results still appear in the workspace.';
      render();
      return;
    }
    const ticket = revision;
    const epoch = ++cameraEpoch;
    present = false;
    cameraState = 'starting';
    render();
    try {
      const candidate = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (signal.aborted || ticket !== revision || epoch !== cameraEpoch || document.hidden || stream) {
        candidate.getTracks().forEach(track => track.stop());
        if (epoch === cameraEpoch) { stopCamera(); render(); }
        return;
      }
      stream = candidate;
      const track = candidate.getVideoTracks()[0];
      const onEnded = () => {
        if (stream !== candidate) return;
        stopCamera();
        render();
        workspace.dispatchEvent(new Event('twin:sensor-stopped'));
      };
      track?.addEventListener('ended', onEnded, { once: true });
      if (track?.readyState !== 'live') { onEnded(); return; }
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (stream !== candidate) return;
      const nextDetector = await createPresenceDetector();
      if (stream !== candidate) { nextDetector.close(); return; }
      detector = nextDetector;
      present = false;
      cameraState = 'waiting';
      const trackPresence = createPresenceTracker();
      let detecting = false;
      frameTimer = setInterval(async () => {
        if (detecting || stream !== candidate || video.readyState < 2) return;
        detecting = true;
        try {
          const found = await nextDetector.containsFace(video);
          if (stream !== candidate) return;
          const next = trackPresence(found);
          if (next !== present) {
            present = next;
            cameraState = next ? 'present' : 'waiting';
            render(false);
          }
        } catch {
          if (stream !== candidate) return;
          stopCamera('denied');
          cameraError = error = 'Presence detection is unavailable. Results still appear in the workspace.';
          render();
        } finally { detecting = false; }
      }, 350);
      error = '';
    } catch (cause) {
      if (epoch !== cameraEpoch) return;
      stopCamera('denied');
      const reasons = {
        NotAllowedError: 'Allow camera access in your browser settings and retry.',
        NotFoundError: 'No camera found. Connect one and retry.',
        NotReadableError: 'The camera is unavailable. Check whether another app is using it.',
      };
      cameraError = error = reasons[cause?.name] || 'Camera unavailable. Results still appear in the workspace.';
    }
    render();
  }
  function refreshQueuedAction() {
    const action = workspace.querySelector('[data-twin-return-diff]');
    if (!action) return;
    const label = !arrival ? 'Back to result preview'
      : draftText.trim() ? 'Discard draft and view newer version' : 'View newer version';
    if (action.textContent !== label) action.textContent = label;
  }
  function render(force = true) {
    const name = handle?.name || manualSource;
    const hasSource = Boolean(name);
    const sourceState = name ? {
      name,
      paused,
      manual: Boolean(manualSource),
      excerpt: (baseline || '').slice(0, 360),
      hasMore: Boolean(baseline?.length > 360),
    } : null;
    const sourceKey = JSON.stringify(sourceState);
    if (reportedSource !== sourceKey) {
      reportedSource = sourceKey;
      workspace.dispatchEvent(new window.CustomEvent('twin:source-state', { detail: sourceState }));
    }
    if (reportedSourceError !== sourceError) {
      reportedSourceError = sourceError;
      workspace.dispatchEvent(new window.CustomEvent('twin:source-error', { detail: sourceError }));
    }
    cameraControl.hidden = configuring;
    cameraDisplay();
    const editing = isEditing();
    const visible = isForeground();
    const relevant = isRelated();
    const mode = deliveryMode({ paused, pending: result && !dismissed, editing, visible, present: present || opened, relevant, configuring });
    const deferred = Boolean(dismissed && result && !paused && !configuring);
    const showDeferred = deferred && visible && relevant && !editing;
    const layout = showDeferred ? 'deferred' : mode;
    panel.dataset.delivery = mode;
    panel.dataset.ambient = ambientLevel;
    panel.dataset.context = !visible ? 'background' : editing ? 'editing' : relevant ? 'related' : 'other-item';
    if (mode === 'preview' && result !== lastCue) {
      lastCue = result;
      if ((ambientLevel === 'off' || ambientLevel === 'quiet') && !quiet && !isQuietTime(quietStart, quietEnd) && workspace.dataset.twinVoiceActive !== 'true') cue();
    }
    workspace.querySelector('.vorb')?.setAttribute('data-tp-ready', String(mode === 'preview' && !opened));
    const marker = workspace.querySelector('[data-twin-result-marker]');
    if (marker) {
      const text = deferred ? '● Review later' : '● New result';
      if (marker.textContent !== text) marker.textContent = text;
      marker.hidden = !(visible && (mode === 'badge' || deferred));
    }
    if (opened && !force && relevant && !configuring && !paused) return;
    if (document.activeElement?.matches('.tp-follow textarea, .tp-docked-review textarea') && !paused) return;
    if (!force && lastMode === layout) return;
    lastMode = layout;
    workspace.querySelector('.tp-docked-review')?.remove();
    panel.replaceChildren();
    const add = (tag, value, parent = panel) => {
      const element = document.createElement(tag);
      element.textContent = value;
      parent.append(element);
      return element;
    };
    const button = (text, callback, parent = panel) => {
      const element = add('button', text, parent);
      element.type = 'button';
      element.addEventListener('click', callback);
      return element;
    };
    const top = add('div', '');
    top.className = 'tp-follow-top';
    const state = add('span', paused ? 'Paused' : handle ? 'Watching · ' + handle.name : manualSource ? 'Manual comparison · ' + manualSource : 'No source selected', top);
    state.setAttribute('role', 'status');
    state.hidden = !paused && !hasSource;
    button(settings ? 'Hide settings' : 'Collaboration settings', () => { settings = !settings; render(); }, top);
    if (error && error !== cameraError) add('p', error).setAttribute('role', 'status');
    if (sourceError && !workspace.querySelector('.twin-workspace')) add('p', sourceError).setAttribute('role', 'status');
    if (settings) {
      add('p', 'Choose a local text file. Twin reads it and prepares a comparison when it changes.');
      button(handle ? 'Replace watched file' : 'Choose a local file', chooseSource);
      if (handle) button(paused ? 'Resume watching' : 'Pause watching', togglePause);
      if (handle) button('Disconnect and clear preview', disconnect);
      button(audio ? 'Turn off sound' : 'Enable and preview sound', toggleSound);
      button(stream ? 'Turn off camera presence' : 'Enable camera presence', toggleCamera);
      if (stream) add('p', present ? 'Presence detected · On device' : 'Waiting for your return · On device');
    }
    if (mode === 'quiet') {
      if (showDeferred) {
        const dock = workspace.querySelector('.dockx .dbody');
        const review = add('section', '', dock || panel);
        review.className = 'tp-docked-review tp-review-deferred';
        review.setAttribute('aria-label', 'Deferred result');
        button('Open deferred result', () => {
          dismissed = false;
          opened = true;
          render();
        }, review);
      }
      return;
    }
    if (mode === 'badge') {
      if (marker) return;
      const badge = button('● A comparison is ready', () => {
        workspace.querySelector('.vcomposer :focus')?.blur();
        if (!related) workspace.querySelector('[data-twin-item=source]')?.click();
        const tab = [...workspace.querySelectorAll('.dockx .tab')].find(item => /^(?:预览|预览台|Preview)$/i.test(item.textContent.trim()));
        tab?.click();
        render();
      });
      badge.className = 'tp-result-badge';
      return;
    }
    const dock = workspace.querySelector('.dockx .dbody');
    const review = add('section', '', dock || panel);
    review.className = 'tp-docked-review';
    review.setAttribute('aria-label', opened ? 'Changes to this source' : 'New Twin result');
    if (!opened) {
      add('strong', example ? 'Twin · One change in the example' : 'Twin · Source updated', review);
      const sourceName = example ? 'Built-in example' : handle?.name || manualSource;
      if (sourceName) add('small', sourceName, review).className = 'tp-result-source';
      const excerpt = result.sections?.[0] || result;
      if (result.sections) add('p', `Found ${result.sections.length} changes. Here is the first one.`, review);
      const pairs = add('dl', '', review);
      pairs.className = 'tp-result-pairs';
      const preview = text => text.length > 180 ? text.slice(0, 180) + '…' : text || 'Blank line';
      add('dt', 'Before', pairs);
      add('dd', excerpt.previousCount ? preview(excerpt.removed) : 'Nothing here before', pairs);
      add('dt', 'After', pairs);
      add('dd', excerpt.currentCount ? preview(excerpt.added) : 'Content removed', pairs);
      button('View full comparison', () => {
        opened = true;
        render();
        workspace.querySelector('.tp-evidence > summary')?.focus();
      }, review).setAttribute('data-twin-open-diff', '');
      if (example) button('Try with my file', () => workspace.dispatchEvent(new Event('twin:choose-source')), review);
      else button(supplemental ? 'View evidence' : 'Add evidence', () => {
        opened = true;
        render();
        const evidence = workspace.querySelector('.tp-docked-review .tp-invitation');
        if (!evidence) return;
        evidence.open = true;
        (evidence.querySelector('textarea') || evidence.querySelector('summary'))?.focus();
      }, review);
      button('Review later', () => { dismissed = true; render(); }, review);
      return;
    }
    add('strong', 'Changes to this source', review);
    const queuedStatus = add('p', arrival ? 'A newer version is ready.' : '', review);
    queuedStatus.dataset.twinQueuedUpdate = '';
    queuedStatus.setAttribute('role', 'status');
    queuedStatus.hidden = !arrival;
    const detail = add('details', '', review);
    detail.open = true;
    detail.className = 'tp-evidence';
    add('summary', 'View before, after, and source', detail);
    add('p', 'Source · ' + (example ? 'Built-in example. No local files were read.' : handle?.name || manualSource), detail);
    for (const section of result.sections || [result]) {
      const location = section.currentStart
        ? `Original line ${section.start} · Updated line ${section.currentStart}`
        : `Starting at line ${section.start}`;
      add('small', `${location} · Before: ${section.previousCount} lines · After: ${section.currentCount} lines`, detail);
      for (const [label, count, text, empty] of [
        ['Before', section.previousCount, section.removed, 'Nothing here before'],
        ['After', section.currentCount, section.added, 'Content removed'],
      ]) {
        if (!count || text.length <= 720) {
          add('p', label + ': ' + (count ? text || 'Blank line' : empty), detail);
          continue;
        }
        const full = add('details', '', detail);
        full.className = 'tp-full-change';
        add('summary', label + ' · View full passage', full);
        const passage = add('div', text, full);
        passage.className = 'tp-full-change-text';
        passage.tabIndex = 0;
        passage.setAttribute('role', 'region');
        passage.setAttribute('aria-label', label + ' full passage');
      }
    }
    if (example) {
      button('Try with my file', () => workspace.dispatchEvent(new Event('twin:choose-source')), review);
      button('Back to result preview', () => {
        opened = false;
        render();
        workspace.querySelector('[data-twin-open-diff]')?.focus();
      }, review);
      return;
    }
    let reuseEvidence;
    if (previousSupplemental) {
      const previousEvidence = add('details', '', review);
      previousEvidence.className = 'tp-evidence';
      add('summary', 'Evidence from the previous comparison', previousEvidence);
      add('p', previousSupplemental.text, previousEvidence);
      add('small', previousSupplemental.source || 'Entered by you', previousEvidence);
      if (!supplemental) {
        reuseEvidence = button('Reuse in this draft', () => {
          if (draftText.trim()) return;
          draftText = previousSupplemental.text;
          draftSource = previousSupplemental.source || 'Entered by you';
          render();
          const next = workspace.querySelector('.tp-docked-review .tp-invitation');
          if (next) {
            next.open = true;
            next.querySelector('textarea')?.focus();
          }
        }, previousEvidence);
      }
    }
    const invitation = add('details', '', review);
    invitation.className = 'tp-invitation';
    add('summary', supplemental ? 'View the excerpt you added' : 'Add an excerpt', invitation);
    const changes = result.sections || [result];
    let targetIndex = supplemental?.section ?? draftSection;
    if (!supplemental && changes.length > 1) {
      const label = add('label', 'Change to review', invitation);
      label.className = 'tp-change-picker';
      const picker = add('select', '', label);
      changes.forEach((change, index) => {
        add('option', `Change ${index + 1} · Original line ${change.start}`, picker).value = String(index);
      });
      picker.value = String(targetIndex);
      picker.addEventListener('change', () => {
        targetIndex = draftSection = Number(picker.value);
        showTarget();
      });
    }
    const target = add('p', '', invitation);
    function showTarget() {
      const change = changes[targetIndex];
      const text = (change.added || change.removed || '').slice(0, 180);
      target.textContent = changes.length > 1
        ? `Change ${targetIndex + 1} · Original line ${change.start}: ${text}`
        : `Review this change: ${text}`;
    }
    showTarget();
    add('p', 'Paste an excerpt or choose a file on this device. It will appear in this comparison when you add it.', invitation);
    if (supplemental) {
      add('strong', 'Evidence · Excerpt you selected', invitation);
      add('p', supplemental.text, invitation);
      add('small', supplemental.source || 'Entered by you', invitation);
      button('Remove excerpt', () => {
        supplemental = undefined;
        render();
        const next = workspace.querySelector('.tp-docked-review .tp-invitation');
        if (next) {
          next.open = true;
          next.querySelector('textarea')?.focus();
        }
      }, invitation);
    } else {
      const draft = add('textarea', '', invitation);
      draft.maxLength = 2000;
      draft.value = draftText;

      draft.setAttribute('aria-label', 'Relevant excerpt');
      const picker = add('input', '', invitation);
      picker.type = 'file';
      picker.accept = '.txt,.md';
      picker.hidden = true;
      picker.setAttribute('aria-label', 'Local evidence file');
      button('Choose a local file', () => picker.click(), invitation);
      const fileStatus = add('p', '', invitation);
      fileStatus.setAttribute('role', 'status');
      fileStatus.hidden = true;
      const estimate = add('div', '', invitation);
      estimate.className = 'tp-evidence-preview';
      add('strong', 'Preview with evidence', estimate);
      const evidence = add('p', '', estimate);
      const source = add('small', '', estimate);
      const commit = button('Add to this comparison', () => {
        if (!draft.value.trim()) return;
        supplemental = { text: draft.value.trim(), source: draftSource, section: targetIndex };
        draftText = draftSource = '';
        draft.blur();
        render();
        const recorded = workspace.querySelector('.tp-docked-review .tp-invitation');
        if (recorded) {
          recorded.open = true;
          recorded.querySelector('summary')?.focus();
        }
      }, invitation);
      function previewDraft() {
        evidence.textContent = draft.value.trim() || 'Choose an excerpt to preview';
        source.textContent = draftSource || (draft.value.trim() ? 'Entered by you' : '');
        commit.disabled = !draft.value.trim();
        if (reuseEvidence) reuseEvidence.disabled = !commit.disabled;
        refreshQueuedAction();
      }
      let draftRevision = 0;
      draft.addEventListener('input', () => {
        draftRevision++;
        draftText = draft.value;
        previewDraft();
      });
      previewDraft();
      picker.onchange = async () => {
        if (!picker.files[0]) return;
        const file = picker.files[0];
        const revisionAtSelection = draftRevision;
        fileStatus.hidden = false;
        fileStatus.textContent = 'Reading file…';
        try {
          const text = await read(file);
          if (!picker.isConnected || file !== picker.files[0]) return;
          if (revisionAtSelection !== draftRevision) {
            picker.value = '';
            fileStatus.textContent = 'Your edits were kept. Choose the file again if needed.';
            return;
          }
          draftText = draft.value = text.slice(0, 2000);
          draftSource = file.name + (text.length > 2000 ? ' · First 2,000 characters, editable' : ' · Editable');
          previewDraft();
          fileStatus.hidden = true;
        } catch (cause) {
          if (picker.isConnected && file === picker.files[0]) fileStatus.textContent = cause.message;
        }
      };
      button('Skip evidence', () => {
        draftText = draftSource = draft.value = '';
        draftSection = 0;
        const targetPicker = invitation.querySelector('select');
        if (targetPicker) targetPicker.value = '0';
        targetIndex = 0;
        showTarget();
        picker.value = '';
        fileStatus.hidden = true;
        invitation.open = false;
        previewDraft();
        invitation.querySelector('summary').focus();
      }, invitation);
    }
    if (dock?.querySelector('.twin-workspace-source')) {
      button('Back to file preview', () => {
        opened = false;
        dismissed = true;
        render();
        dock.querySelector('.tp-review-deferred button')?.focus();
      }, review);
    }
    button('Back to result preview', () => {
      opened = false;
      if (arrival) {
        const queued = arrival;
        arrival = undefined;
        const change = changedLines(queued.previous, queued.latest);
        if (change.previousCount || change.currentCount) publish(change, queued.previous);
        else render();
      }
      else render();
      (workspace.querySelector('[data-twin-open-diff]') || workspace.querySelector('[data-twin-source-picker]'))?.focus();
    }, review).setAttribute('data-twin-return-diff', '');
    refreshQueuedAction();
  }

  function publish(next, previous, keepDeferred = false) {
    previousSupplemental = next ? supplemental : undefined;
    result = next;
    pendingFrom = previous;
    supplemental = undefined;
    draftSection = 0;
    draftText = draftSource = '';
    dismissed = keepDeferred;
    opened = false;
    render();
  }

  function acceptFileVersion(next) {
    const previous = baseline;
    baseline = next;
    const immediate = changedLines(previous, next);
    if (!immediate.previousCount && !immediate.currentCount) return false;
    if (opened) {
      arrival = { previous: arrival?.previous ?? previous, latest: next };
      const queuedStatus = workspace.querySelector('[data-twin-queued-update]');
      if (queuedStatus?.hidden) {
        queuedStatus.hidden = false;
        queuedStatus.textContent = 'A newer version is ready.';
      }
      refreshQueuedAction();
      return true;
    }
    const from = result && (dismissed || lastCue !== result) ? pendingFrom ?? previous : previous;
    const combined = from === previous ? immediate : changedLines(from, next);
    if (combined.previousCount || combined.currentCount) publish(combined, from, dismissed);
    else publish(undefined);
    return true;
  }

  const selectItem = key => {
    related = key === 'source';
    render();
  };
  workspace.addEventListener('twin:item-selected', event => selectItem(event.detail), { signal });
  workspace.addEventListener('compositionstart', () => { composing = true; render(false); }, { signal });
  workspace.addEventListener('compositionend', () => { composing = false; render(false); }, { signal });
  workspace.addEventListener('click', event => {
    if (event.target.closest('.dockx .tab')) requestAnimationFrame(() => { if (!signal.aborted) render(false); });
  }, { signal });

  async function poll() {
    if (busy || paused || !handle || !isForeground()) return;
    const ticket = revision;
    busy = true;
    try {
      const next = await read(await handle.getFile());
      if (signal.aborted || ticket !== revision || !isForeground() || next === baseline) return;
      acceptFileVersion(next);
    } catch {
      if (!signal.aborted && ticket === revision && isForeground()) {
        paused = true;
        sourceError = 'Could not continue reading. Select the file again or resume watching.';
        render();
      }
    } finally { busy = false; }
  }
  const timer = setInterval(poll, 1800);
  document.addEventListener('focusin', event => {
    if (!event.target.closest('.tp-follow, .tp-docked-review, [data-twin-item]')) render(false);
  }, { signal });
  document.addEventListener('focusout', event => {
    if (!event.target.closest('.tp-follow, .tp-docked-review')) setTimeout(() => { if (!signal.aborted && !document.activeElement?.closest('[data-twin-item]')) render(false); }, 0);
  }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (stream || cameraState === 'starting') stopCamera('background');
      stopAmbient();
    }
    else void poll();
    render(false);
  }, { signal });
  window.addEventListener('focus', () => {
    void poll();
    render(false);
  }, { signal });
  window.addEventListener('blur', () => render(false), { signal });
  render();
  function togglePause() {
    paused = !paused;
    revision++;
    if (paused) { stopCamera(); stopAmbient(); }
    else {
      sourceError = '';
      void poll();
    }
    render();
  }
  function disconnect() {
    revision++;
    example = false;
    handle = manualSource = baseline = result = supplemental = previousSupplemental = lastCue = arrival = pendingFrom = undefined;
    draftText = draftSource = '';
    paused = dismissed = opened = false;
    stopCamera();
    stopAmbient();
    sourceError = '';
    render();
  }
  return {
    chooseSource, chooseSnapshot, toggleSound, toggleCamera, toggleAmbient, togglePause, disconnect,
    showExample() {
      if (handle || manualSource || result || paused) return;
      example = true;
      publish(changedLines(
        'Weekly update\nDelivery: TBD\nOwner: Lin',
        'Weekly update\nDelivery: Friday at 4 PM\nOwner: Lin',
      ));
    },
    setConfiguring(value) { if (configuring !== value) { configuring = value; render(); } },
    setQuiet(value) { quiet = value; render(); },
    setQuietHours(start, end) {
      quietStart = start;
      quietEnd = end;
      try {
        if (start && end) window.localStorage.setItem(quietHoursKey, start + ',' + end);
        else window.localStorage.removeItem(quietHoursKey);
      } catch {
        // Keep the current settings in memory.
      }
    },

    get setup() { return { source: handle?.name || manualSource, manual: Boolean(manualSource), paused, quiet, quietStart, quietEnd, ambient: ambientLevel !== 'off', sound: audio?.state === 'running', camera: !!stream, error, sourceError }; },
    remove() {
      controller.abort();
      clearInterval(timer);
      stopCamera();
      stopAmbient();
      if (audio) void audio.close();
      workspace.querySelector('.tp-docked-review')?.remove();
      cameraControl.remove();
      panel.remove();
    },
    pause() {
      paused = true;
      revision++;
      stopCamera();
      stopAmbient();
      render();
    },
  };
}
