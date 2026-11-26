import { useEffect, useRef } from 'react';

const colors = {
  listen: [111, 227, 189],
  speak: [156, 192, 255],
  think: [185, 166, 255],
};

export function TwinParticles() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const host = element.parentElement;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const points = Array.from({ length: 2000 }, () => {
      const height = Math.random() * 2 - 1;
      const angle = Math.random() * Math.PI * 2;
      const shell = .42 + .58 * Math.pow(Math.random(), .45);
      const horizontal = Math.sqrt(1 - height ** 2) * shell;
      return {
        x: horizontal * Math.cos(angle), y: height * shell, z: horizontal * Math.sin(angle),
        phase: Math.random() * Math.PI * 2, size: Math.random() < .12 ? 2.4 : 1.2 + Math.random() * .4,
      };
    });

    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 16;
    const pigment = sprite.getContext('2d');
    if (!pigment) return;
    let width = 0;
    let height = 0;
    let frame = 0;
    let rotation = .45;
    let tint = '';
    let likeness = 0;
    let voiceLevel = 0;
    let visible = true;

    function paint(time: number) {
      if (!context || !pigment) return;
      const phase = host?.dataset.tpPhase;
      const color = colors[phase === 'thinking' ? 'think' : phase === 'responding' || phase === 'speaking' || voiceLevel > .08 ? 'speak' : 'listen'].join(',');
      if (color !== tint) {
        tint = color;
        pigment.clearRect(0, 0, 16, 16);
        const dot = pigment.createRadialGradient(8, 8, 0, 8, 8, 8);
        dot.addColorStop(0, '#fff');
        dot.addColorStop(.25, `rgba(${tint}, .95)`);
        dot.addColorStop(1, `rgba(${tint}, 0)`);
        pigment.fillStyle = dot;
        pigment.fillRect(0, 0, 16, 16);
      }

      voiceLevel += (Number(host?.dataset.tpVoiceLevel ?? 0) - voiceLevel) * .16;
      const level = Math.min(width * .42, height * .46) * (1 + voiceLevel * .09);
      if (level <= 0) return;
      const heldUnderstandings = Number(host?.dataset.likeness ?? 0);
      const targetLikeness = host?.dataset.tpFace === 'true' ? heldUnderstandings / 3 : 0;
      likeness = reducedMotion.matches ? targetLikeness : likeness + (targetLikeness - likeness) * .075;
      const cx = width / 2;
      const cy = height / 2;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const tiltCos = Math.cos(.35);
      const tiltSin = Math.sin(.35);
      const halo = context.createRadialGradient(cx, cy, 0, cx, cy, level * 1.25);
      halo.addColorStop(0, `rgba(${tint}, .21)`);
      halo.addColorStop(.55, `rgba(${tint}, .055)`);
      halo.addColorStop(1, `rgba(${tint}, 0)`);
      context.clearRect(0, 0, width, height);
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';
      for (const point of points) {
        const x = point.x * cos - point.z * sin;
        const orbit = point.x * sin + point.z * cos;
        const depth = point.y * tiltSin + orbit * tiltCos;
        const y = point.y * tiltCos - orbit * tiltSin;
        const perspective = 1.9 / (2.6 - depth);
        const light = reducedMotion.matches ? .9 : .88 + .12 * (1 - likeness) * Math.sin(time / 600 + point.phase);
        const projectedX = x * perspective;
        const projectedY = y * perspective;
        const centerDistance = Math.hypot(projectedX, projectedY);
        const veil = Math.min(centerDistance / .55, 1);
        const size = point.size * (1 + depth * .25) * 2.2;
        context.globalAlpha = (.65 + depth * .3) * light * (1 - .7 * likeness * (1 - veil));
        context.drawImage(sprite, cx + projectedX * level - size / 2, cy + projectedY * level - size / 2, size, size);
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
    }

    function tick(time: number) {
      if (!reducedMotion.matches && visible && !document.hidden) {
        rotation += host?.dataset.tpPhase === 'thinking' ? .009 : .0028;
        paint(time);
      }
      frame = requestAnimationFrame(tick);
    }

    function resize() {
      if (!element || !context) return;
      ({ width, height } = element.getBoundingClientRect());
      const scale = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(width * scale));
      element.height = Math.max(1, Math.round(height * scale));
      context.setTransform(scale, 0, 0, scale, 0, 0);
      paint(0);
    }

    const visibilityObserver = new IntersectionObserver(entries => {
      visible = Boolean(entries[0]?.isIntersecting);
    });
    visibilityObserver.observe(element);
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const stateObserver = new MutationObserver(() => {
      if (reducedMotion.matches) paint(0);
    });
    if (host) stateObserver.observe(host, { attributes: true, attributeFilter: ['data-likeness', 'data-tp-face', 'data-tp-phase'] });
    resize();
    frame = requestAnimationFrame(tick);
    return () => {
      observer.disconnect();
      visibilityObserver.disconnect();
      stateObserver.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvas} className="twin-particle-canvas" aria-hidden="true" />;
}
