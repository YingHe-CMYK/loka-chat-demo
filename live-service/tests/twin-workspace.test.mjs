import { strictEqual as expect } from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { afterEach, test } from 'node:test';
import { transformSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createElement, useState } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'https://loka.example' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.FormData = dom.window.FormData;

registerHooks({
  load(url, context, nextLoad) {
    if (!/\/src\/twin-workspace\/(workspace-view|trade-review|journey-step|initiative-voice|decision-follow-up|training-examples)\.tsx$/.test(url)) return nextLoad(url, context);
    const jsx = readFileSync(new URL(url), 'utf8');
    return { format: 'module', shortCircuit: true, source: transformSync(jsx, { loader: 'tsx', jsx: 'automatic' }).code };
  },
});

const { act, render, cleanup, screen, within } = await import('@testing-library/react');
const { default: userEvent } = await import('@testing-library/user-event');
const { TwinWorkspaceView, TwinResultView } = await import('../src/twin-workspace/workspace-view.tsx');
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

test('selects an item without moving an existing result marker to another item', async () => {
  const user = userEvent.setup({ document });
  function Workspace() {
    const [currentItem, setCurrentItem] = useState('source');
    return createElement(TwinWorkspaceView, {
      identity: null, composer: null, settings: null, result: null,
      currentItem, onSelectItem: setCurrentItem,
      items: [{ id: 'source', label: 'Source comparison', pending: true }, { id: 'notes', label: 'Notes', pending: false }],
      onPermissions() {}, onReminderSettings() {},
    });
  }
  render(createElement(Workspace));
  await user.click(screen.getByRole('button', { name: 'Notes' }));
  expect(screen.getByRole('button', { name: 'Notes' }).getAttribute('aria-pressed'), 'true');
  const source = screen.getByRole('button', { name: /Source comparison/ });
  expect(source.getAttribute('aria-pressed'), 'false');
  expect(within(source).getByText(/New result/).hidden, false);
});

test('opens the matching configuration from each workbench entry', async () => {
  const user = userEvent.setup({ document });
  const opened = [];
  render(createElement(TwinWorkspaceView, {
    identity: null, composer: null, settings: null, result: null,
    items: [], currentItem: '', onSelectItem() {},
    onPermissions: () => opened.push('permissions'),
    onReminderSettings: () => opened.push('reminders'),
  }));
  await user.click(screen.getByRole('button', { name: 'My Twin' }));
  await user.click(screen.getByRole('button', { name: 'Alerts' }));
  expect(opened.join(','), 'permissions,reminders');
  const points = screen.getByRole('link', { name: 'Account points (opens in a new tab)' });
  expect(points.getAttribute('href'), '/?identity=1&qb=1');
  expect(points.getAttribute('target'), '_blank');
});

test('presents loading, empty, failure and the actual result', () => {
  const view = render(createElement(TwinResultView, { state: 'loading' }));
  expect(screen.getByRole('region', { name: 'Changes to this source' }).getAttribute('aria-busy'), 'true');
  expect(screen.getByRole('status').textContent, 'Preparing the comparison…');
  view.rerender(createElement(TwinResultView, { state: 'empty' }));
  expect(screen.getByRole('region', { name: 'Changes to this source' }).getAttribute('aria-busy'), 'false');
  expect(Boolean(screen.getByText(/on this device/)), true);
  view.rerender(createElement(TwinResultView, { state: 'error' }, '权限已失效'));
  expect(screen.getByRole('alert').textContent, '权限已失效');
  view.rerender(createElement(TwinResultView, { state: 'ready' }, '负责人已变更'));
  expect(screen.getByRole('region', { name: 'Changes to this source' }).textContent, '负责人已变更');
  expect(screen.queryByRole('alert'), null);
});

test('previews a selected source excerpt before adding it to the result', async () => {
  const { mountProactive } = await import('../public/twin-presence/proactive.mjs');
  const previousController = globalThis.AbortController;
  globalThis.AbortController = window.AbortController;
  const originalHasFocus = document.hasFocus;
  document.hasFocus = () => true;
  const user = userEvent.setup({ document });
  const root = document.createElement('main');
  root.className = 'twin-root';
  const anchor = root.appendChild(document.createElement('span'));
  document.body.append(root);
  const proactive = mountProactive(anchor);
  try {
    const localFile = text => ({ name: 'review.txt', size: text.length, text: async () => text });
    await proactive.chooseSnapshot(localFile('Owner: pending'));
    await proactive.chooseSnapshot(localFile('Owner: Lin'), true);
    expect(screen.getByText('Owner: pending').textContent, 'Owner: pending');
    expect(screen.getByText('Owner: Lin').textContent, 'Owner: Lin');
    await proactive.chooseSnapshot(localFile('Owner: Lin\nDeadline: Friday'), true);
    expect(Boolean(screen.getByText('Nothing here before')), true);
    expect(Boolean(screen.getByText('Deadline: Friday')), true);
    await proactive.chooseSnapshot(localFile('Owner: Lin'), true);
    expect(Boolean(screen.getByText('Content removed')), true);
    await user.click(screen.getByRole('button', { name: 'Add evidence' }));
    expect(screen.getByRole('textbox', { name: 'Relevant excerpt' }), document.activeElement);
    const commit = screen.getByRole('button', { name: 'Add to this comparison' });
    expect(commit.disabled, true);
    const picker = root.querySelector('.tp-invitation input[type=file]');
    expect(picker.hidden, true);
    let pickerClicked = false;
    picker.addEventListener('click', () => { pickerClicked = true; });
    await user.click(screen.getByRole('button', { name: 'Choose a local file' }));
    expect(pickerClicked, true);
    const read = Promise.withResolvers();
    const file = new window.File(['file'], 'evidence.txt', { type: 'text/plain' });
    file.text = () => read.promise;
    await user.upload(picker, file);
    await user.type(screen.getByRole('textbox', { name: 'Relevant excerpt' }), 'Lin confirmed');
    await act(async () => read.resolve('迟到的文件内容'));
    expect(Boolean(screen.getByText(/Your edits were kept/)), true);
    expect(within(root.querySelector('.tp-evidence-preview')).getByText('Lin confirmed').textContent, 'Lin confirmed');
    expect(commit.disabled, false);
    await user.click(commit);
    expect(screen.getByText('Evidence · Excerpt you selected').textContent, 'Evidence · Excerpt you selected');
    expect(screen.getByText('Lin confirmed').textContent, 'Lin confirmed');
    expect(document.activeElement, screen.getByText('View the excerpt you added'));
    await user.click(screen.getByRole('button', { name: 'Remove excerpt' }));
    const nextDraft = screen.getByRole('textbox', { name: 'Relevant excerpt' });
    expect(document.activeElement, nextDraft);
    expect(nextDraft.value, '');
    await user.click(screen.getByRole('button', { name: 'Back to result preview' }));
    expect(document.activeElement, screen.getByRole('button', { name: 'View full comparison' }));
    const longLine = 'Long evidence '.repeat(90) + 'last sentence';
    await proactive.chooseSnapshot(localFile(longLine), true);
    await user.click(screen.getByRole('button', { name: 'View full comparison' }));
    expect(document.activeElement, screen.getByText('View before, after, and source'));
    const longDetail = screen.getByText('After · View full passage');
    await user.click(longDetail);
    expect(longDetail.parentElement.open, true);
    const passage = within(longDetail.parentElement).getByRole('region', { name: 'After full passage' });
    expect(passage.tabIndex, 0);
    expect(passage.textContent.endsWith('last sentence'), true);
  } finally {
    proactive.remove();
    root.remove();
    document.hasFocus = originalHasFocus;
    globalThis.AbortController = previousController;
  }
});


const { TradeReview } = await import('../src/twin-workspace/trade-review.tsx');

test('profile lookup only loads trades after a unique exact match and saves only the selected rule', async t => {
  const user = userEvent.setup({ document });
  const firstAddress = '0x' + 'a'.repeat(40);
  const secondAddress = '0x' + 'b'.repeat(40);
  const exact = { name: 'Lin', proxyWallet: firstAddress };
  let profiles = [exact, { name: 'lin', proxyWallet: secondAddress }];
  const addresses = [];
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.hostname === 'gamma-api.polymarket.com') return Response.json({ profiles });
    addresses.push(url.searchParams.get('user'));
    return Response.json({ data: [1, 2].map(timestamp => ({
      type: 'TRADE', side: 'BUY', title: '示例市场', timestamp, price: timestamp === 1 ? 0.5 : 0.55,
      token_id: '42', transaction_hash: String(timestamp), outcome: 'Yes', size: timestamp * 10,
    })) });
  });
  const reminderKey = 'loka-twin-workspace:trade-reminder';
  t.after(() => window.localStorage.removeItem(reminderKey));

  render(createElement(TradeReview));
  await user.click(screen.getByRole('button', { name: 'Read from Polymarket' }));
  await user.type(screen.getByRole('textbox', { name: /Polymarket profile URL/ }), 'https://polymarket.com/@Lin');
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  expect((await screen.findByRole('alert')).textContent.includes('could not identify a unique profile'), true);
  expect(addresses.length, 0);

  profiles = [{ name: 'Lin-Trades', proxyWallet: secondAddress }, exact];
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  await screen.findByRole('heading', { name: 'Were these two buys part of the same plan?' });
  expect(addresses.join(','), firstAddress);
  expect(Boolean(screen.getByText('Polymarket @Lin')), true);
  expect(Boolean(screen.getByText('Public trades reviewed: 2')), true);
  expect(Boolean(screen.getByText('The second fill was 0.05 pUSD higher.')), true);
  await user.click(screen.getByText('View trade evidence'));
  const evidence = screen.getByText('View trade evidence').closest('details');
  expect(within(evidence).getAllByText(/示例市场 · Yes · Buy/).length, 2);
  expect(within(evidence).getAllByText('Used in this judgment').length, 2);
  await user.click(screen.getByRole('button', { name: 'Needs correction', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Two planned buys' }));
  await user.click(screen.getByRole('button', { name: 'Compare buy limit' }));
  await user.type(screen.getByRole('textbox', { name: 'Trade note' }), 'Buy limit 0.50 pUSD');
  await user.click(screen.getByRole('button', { name: 'Compare buy limit' }));
  expect(Boolean(screen.getByText(/exceeds your buy limit/)), true);
  expect(evidence.querySelector('time').dateTime, '1970-01-01T00:00:01.000Z');
  expect(Boolean(within(evidence).getByText(/0.55 pUSD\/share · 20 shares/)), true);
  await user.click(screen.getByRole('button', { name: 'Needs correction', exact: true }));
  await user.type(screen.getByRole('textbox', { name: /Reason for this review/ }), '原先的仓位是对冲用的');
  expect(screen.queryByText(/原先的仓位是对冲用的/, { selector: 'p' }), null);
  await user.click(screen.getByRole('button', { name: 'Send correction' }));
  expect(Boolean(screen.getByText(/原先的仓位是对冲用的/, { selector: 'p' })), true);
  expect(Boolean(screen.getByText(/Compare both fills with your explanation/)), true);
  expect(screen.queryByRole('button', { name: 'Save reminder' }), null);
  await user.click(screen.getByRole('button', { name: 'Edit correction' }));
  await user.click(screen.getByRole('button', { name: 'News prompted the buy' }));
  expect(Boolean(screen.getByText(/You said new information changed your view/)), true);
  expect(Boolean(screen.getByText(/which news changed your view/)), true);
  await user.click(screen.getByRole('button', { name: 'Check news timing' }));
  const newsNote = screen.getByRole('textbox', { name: 'Trade note' });
  await user.type(newsNote, 'Announcement 1970-01-01T00:00:00Z');
  await user.click(screen.getByRole('button', { name: 'Check news timing' }));
  expect(Boolean(screen.getByText(/The news timestamp precedes the second fill/)), true);
  await user.click(screen.getByRole('button', { name: 'Edit correction' }));
  await user.click(screen.getByRole('button', { name: 'Fills from one order' }));
  expect(Boolean(screen.getByText(/You said these were fills from one order/)), true);
  expect(Boolean(screen.getByText(/group fills from the same order/)), true);
  expect(Boolean(screen.getByText(/These fills may come from one order/)), true);
  expect(screen.queryByRole('textbox', { name: 'Trade note' }), null);
  await user.click(screen.getByRole('button', { name: 'Compare order IDs' }));
  await user.clear(screen.getByRole('textbox', { name: 'Trade note' }));
  await user.type(screen.getByRole('textbox', { name: 'Trade note' }), '订单编号 A123{enter}成交编号 F789');
  await user.click(screen.getByRole('button', { name: 'Compare order IDs' }));
  expect(Boolean(screen.getByText('订单编号 A123')), true);
  expect(Boolean(screen.getByText(/Add one order ID for each fill/)), true);
  await user.click(screen.getByRole('button', { name: 'Edit note' }));
  let note = screen.getByRole('textbox', { name: 'Trade note' });
  await user.clear(note);
  await user.type(note, '订单编号 A123{enter}订单编号 B456');
  await user.click(screen.getByRole('button', { name: 'Compare order IDs' }));
  expect(Boolean(screen.getByText('The two order IDs you provided differ.')), true);
  await user.click(screen.getByRole('button', { name: 'Edit note' }));
  note = screen.getByRole('textbox', { name: 'Trade note' });
  await user.clear(note);
  await user.type(note, '订单编号 A123{enter}订单编号 A123');
  await user.click(screen.getByRole('button', { name: 'Compare order IDs' }));
  expect(Boolean(screen.getByText('The two order IDs you provided match.')), true);
  expect(window.localStorage.length, 0);
  await user.click(screen.getByRole('button', { name: 'Save reminder' }));
  expect(window.localStorage.getItem(reminderKey), 'public-split');
  expect(document.activeElement, screen.getByRole('button', { name: 'Reminder saved' }));
  expect(window.localStorage.length, 1);
  await user.click(screen.getByRole('button', { name: 'Edit correction' }));
  await user.click(screen.getByRole('button', { name: 'News prompted the buy' }));
  expect(window.localStorage.getItem(reminderKey), 'public-split');
  await user.click(screen.getByRole('button', { name: 'Update reminder' }));
  await user.click(screen.getByRole('button', { name: 'Clear this review' }));
  expect(screen.getByRole('textbox', { name: /Polymarket profile URL/ }).value, '');
  expect(window.localStorage.getItem(reminderKey), 'public-news');
  await user.type(screen.getByRole('textbox', { name: /Polymarket profile URL/ }), firstAddress);
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  const previous = await screen.findByRole('complementary', { name: 'Previously saved review reminder' });
  expect(Boolean(screen.getByText('Polymarket 0xaaaa…aaaa')), true);
  expect(Boolean(within(previous).getByText(/which news changed your view/)), true);
  expect(screen.getByRole('button', { name: 'Right', exact: true }).getAttribute('aria-pressed'), 'false');
});


test('cancelled profile lookup cannot start a trade read after a new lookup', async t => {
  const user = userEvent.setup({ document });
  const address = '0x' + 'a'.repeat(40);
  const staleLookup = Promise.withResolvers();
  const hosts = [];
  t.mock.method(globalThis, 'fetch', async url => {
    hosts.push(url.hostname);
    if (url.hostname === 'gamma-api.polymarket.com') return staleLookup.promise;
    return Response.json({ data: [] });
  });

  render(createElement(TradeReview));
  await user.click(screen.getByRole('button', { name: 'Read from Polymarket' }));
  const input = screen.getByRole('textbox', { name: /Polymarket profile URL/ });
  expect(document.activeElement, input);
  const profileHelp = screen.getByRole('link', { name: 'Open Polymarket' });
  expect(profileHelp.getAttribute('href'), 'https://polymarket.com/');
  expect(profileHelp.getAttribute('target'), '_blank');
  expect(hosts.length, 0);
  await user.type(input, 'https://polymarket.com/@Lin');
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  await user.click(screen.getByRole('button', { name: 'Cancel lookup' }));
  expect(document.activeElement, input);
  await user.clear(input);
  await user.type(input, address);
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  await screen.findByText(/No public trades found/);

  await act(async () => staleLookup.resolve(Response.json({ profiles: [{ name: 'Lin', proxyWallet: address }] })));
  expect(hosts.join(','), 'gamma-api.polymarket.com,data-api.polymarket.com');
  expect(screen.queryByRole('alert'), null);
  await user.click(screen.getByRole('button', { name: 'Back to trade review' }));
  expect(document.activeElement, screen.getByRole('button', { name: 'Read from Polymarket' }));
  await user.click(screen.getByRole('button', { name: 'Read from Polymarket' }));
  expect(screen.getByRole('textbox', { name: /Polymarket profile URL/ }).value, address);
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  await screen.findByText(/No public trades found/);
  await user.click(screen.getByRole('button', { name: 'Try an example' }));
  expect(Boolean(screen.getByText('Example · 4 fills')), true);
  await user.click(screen.getByRole('button', { name: 'Review my own trades' }));
  expect(screen.getByRole('textbox', { name: /Polymarket profile URL/ }).value, address);
});


test('cancel during reconnect preserves the profile link and stops further requests', async t => {
  const user = userEvent.setup({ document });
  const request = t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Connection reset');
  });

  render(createElement(TradeReview));
  await user.click(screen.getByRole('button', { name: 'Read from Polymarket' }));
  const input = screen.getByRole('textbox', { name: /Polymarket profile URL/ });
  const profile = 'https://polymarket.com/profile/0x' + 'a'.repeat(40);
  await user.type(input, 'unrecognized input');
  expect(window.sessionStorage.getItem('loka-twin-workspace:trade-draft'), null);
  await user.clear(input);
  await user.type(input, profile);
  expect(window.sessionStorage.getItem('loka-twin-workspace:trade-draft'), profile);
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  await screen.findByText('No response yet. Retrying…');
  await user.click(screen.getByRole('button', { name: 'Cancel lookup' }));
  await act(async () => new Promise(resolve => setTimeout(resolve, 450)));

  expect(request.mock.callCount(), 1);
  expect(input.value, profile);
  expect(document.activeElement, input);
  expect(screen.queryByRole('alert'), null);
});


test('a rate-limited trade read honors Retry-After and recovers without another click', async t => {
  const user = userEvent.setup({ document });
  const attempts = [];
  t.mock.method(globalThis, 'fetch', async () => {
    attempts.push(performance.now());
    if (attempts.length === 1) {
      return Response.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '1' } });
    }
    return Response.json({ data: [] });
  });

  render(createElement(TradeReview, { initiallyOpen: true }));
  const input = screen.getByRole('textbox', { name: /Polymarket profile URL/ });
  await user.type(input, '0x' + 'a'.repeat(40));
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  await screen.findByText('No response yet. Retrying…');
  await screen.findByText(/No public trades found/, {}, { timeout: 2500 });

  expect(attempts.length, 2);
  expect(attempts[1] - attempts[0] >= 1000, true);
  expect(screen.queryByRole('alert'), null);
});


test('a guided public lookup failure leaves a replay and the original address available', async t => {
  const user = userEvent.setup({ document });
  const request = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 403 }));
  render(createElement(TradeReview, { initiallyOpen: true, guidedSources: true }));
  await user.click(screen.getByRole('button', { name: 'Polymarket profile' }));
  const address = '0x' + 'a'.repeat(40);
  const profile = screen.getByRole('textbox', { name: /Polymarket profile URL/ });
  await user.type(profile, address);
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  const fallback = await screen.findByRole('region', { name: 'Continue without public fills' });
  expect(profile.value, address);
  await user.click(within(fallback).getByRole('button', { name: 'Select price rises' }));
  await user.click(within(fallback).getByRole('button', { name: /Mark my entry/ }));
  await user.click(within(fallback).getByRole('button', { name: 'Keep only my first move' }));
  await within(screen.getByRole('region', { name: 'Compare the next decision' })).findByText(/In this hypothetical situation/);
  expect(request.mock.callCount(), 1);
});

test('a guided empty public profile can continue while retaining the submitted address', async t => {
  const user = userEvent.setup({ document });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [] }));
  render(createElement(TradeReview, { initiallyOpen: true, guidedSources: true }));
  await user.click(screen.getByRole('button', { name: 'Polymarket profile' }));
  const address = '0x' + 'a'.repeat(40);
  const profile = screen.getByRole('textbox', { name: /Polymarket profile URL/ });
  await user.type(profile, address);
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  const fallback = await screen.findByRole('region', { name: 'Continue without public fills' });
  expect(profile.value, address);
  await user.click(within(fallback).getByRole('button', { name: 'Select price rises' }));
  await user.click(within(fallback).getByRole('button', { name: /Mark my entry/ }));
  await user.click(within(fallback).getByRole('button', { name: 'Keep only my first move' }));
  await within(screen.getByRole('region', { name: 'Compare the next decision' })).findByText(/In this hypothetical situation/);
  await user.click(screen.getByRole('button', { name: /Back to information sources/ }));
  await user.click(screen.getByRole('button', { name: 'Polymarket profile' }));
  expect(screen.getByRole('textbox', { name: /Polymarket profile URL/ }).value, address);
});

test('a guided public review without enough evidence offers a replay without requiring a note', async t => {
  const user = userEvent.setup({ document });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [
    { type: 'TRADE', title: 'One market', price: 0.5, token_id: '42', side: 'BUY', timestamp: 1, transaction_hash: 'first' },
  ] }));
  render(createElement(TradeReview, { initiallyOpen: true, guidedSources: true }));
  await user.click(screen.getByRole('button', { name: 'Polymarket profile' }));
  await user.type(screen.getByRole('textbox', { name: /Polymarket profile URL/ }), '0x' + 'a'.repeat(40));
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  const replay = await screen.findByRole('button', { name: /Open the replay/ });
  await user.click(replay);
  await screen.findByText('I do not have enough evidence here to infer a trading habit.');
  expect(screen.queryByRole('textbox', { name: 'Trade note' }), null);
  await user.click(await screen.findByRole('button', { name: 'Select price rises' }));
  await user.click(screen.getByRole('button', { name: /Mark my entry/ }));
  await user.click(screen.getByRole('button', { name: 'Keep only my first move' }));
  await within(screen.getByRole('region', { name: 'Compare the next decision' })).findByText(/In this hypothetical situation/);
});

test('an intervening sale keeps separate purchases from being presented as one buying sequence', async t => {
  const reminderKey = 'loka-twin-workspace:trade-reminder';

  const user = userEvent.setup({ document });
  const trade = { type: 'TRADE', title: '示例市场', price: 0.5, token_id: '42' };
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [
    { ...trade, side: 'BUY', timestamp: 3, transaction_hash: 'second' },
    { ...trade, side: 'SELL', timestamp: 2 },
    { ...trade, side: 'BUY', timestamp: 1, transaction_hash: 'first' },
  ] }));

  window.localStorage.setItem(reminderKey, 'public-news');
  render(createElement(TradeReview));
  await user.click(screen.getByRole('button', { name: 'Read from Polymarket' }));
  const address = '0x' + 'a'.repeat(40);
  await user.type(screen.getByRole('textbox', { name: /Polymarket profile URL/ }), `polymarket.com/profile/${address}?tab=activity`);
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  await screen.findByRole('heading', { name: '2 buys · 1 sell' });
  expect(Boolean(screen.getByText('I do not have enough evidence here to infer a trading habit.')), true);
  expect(Boolean(screen.getByText(/3 fills/)), true);
  expect(Boolean(screen.getByText(/Start with this outcome/)), true);
  expect(screen.getAllByText('Suggested for review').length, 3);
  await user.click(screen.getByRole('button', { name: 'Compare trade plan' }));
  await user.type(screen.getByRole('textbox', { name: 'Trade note' }), 'Original plan: one buy{enter}Actual fills: two buys');
  await user.click(screen.getByRole('button', { name: 'Compare trade plan' }));
  expect(Boolean(screen.getByText('From your notes')), true);
  expect(Boolean(screen.getByText('Actual fills: two buys')), true);
  expect(fetch.mock.callCount(), 1);
  expect(fetch.mock.calls[0].arguments[0].searchParams.get('user'), address);
  expect(screen.queryByRole('button', { name: 'Right', exact: true }), null);
  const saved = screen.getByRole('complementary', { name: 'Previously saved review reminder' });
  await user.click(within(saved).getByRole('button', { name: 'Remove reminder' }));
  expect(window.localStorage.getItem(reminderKey), null);
});


test('a trade result arriving while the user writes elsewhere does not steal focus', async t => {
  const user = userEvent.setup({ document });
  const pending = Promise.withResolvers();
  t.mock.method(globalThis, 'fetch', () => pending.promise);
  render(createElement('div', null, createElement('textarea', { 'aria-label': '我的笔记' }), createElement(TradeReview)));
  await user.click(screen.getByRole('button', { name: 'Read from Polymarket' }));
  await user.type(screen.getByRole('textbox', { name: /Polymarket profile URL/ }), '0x' + 'a'.repeat(40));
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  const notes = screen.getByRole('textbox', { name: '我的笔记' });
  await user.type(notes, '正在写');
  await act(async () => pending.resolve(Response.json({ data: [
    { type: 'TRADE', side: 'BUY', title: '示例市场', timestamp: 1, price: 0.5 },
  ] })));
  await screen.findByRole('heading', { name: '1 buy · 0 sells' });
  expect(document.activeElement, notes);
  expect(notes.value, '正在写');
});

test('a failed trade read preserves the same profile link for manual retry', async t => {
  const user = userEvent.setup({ document });
  const profile = 'https://polymarket.com/profile/0x' + 'a'.repeat(40);
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(url.href);
    return urls.length === 1 ? new Response(null, { status: 500 }) : Response.json({ data: [] });
  });

  render(createElement(TradeReview));
  await user.click(screen.getByRole('button', { name: 'Read from Polymarket' }));
  const input = screen.getByRole('textbox', { name: /Polymarket profile URL/ });
  await user.type(input, profile);
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  expect((await screen.findByRole('alert')).textContent.includes('Your link is still here'), true);
  expect(input.value, profile);

  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  await screen.findByText(/No public trades found/);
  expect(urls.length, 2);
  expect(urls[0], urls[1]);
});

test('temporary gateway errors recover without a second click', async t => {
  const user = userEvent.setup({ document });
  const statuses = [502, 504, 200];
  const request = t.mock.method(globalThis, 'fetch', async () => {
    const status = statuses.shift();
    return Response.json({ data: [] }, { status });
  });

  render(createElement(TradeReview, { initiallyOpen: true }));
  await user.type(screen.getByRole('textbox', { name: /Polymarket profile URL/ }), '0x' + 'a'.repeat(40));
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  await screen.findByText('No response yet. Retrying…');
  await screen.findByText(/No public trades found/, {}, { timeout: 3000 });

  expect(request.mock.callCount(), 3);
  expect(screen.queryByRole('alert'), null);
});

test('the default trade entry compares notes without requiring a platform account', async () => {
  const user = userEvent.setup({ document });
  render(createElement(TradeReview));
  expect(Boolean(screen.getByText('Example result')), true);
  await user.type(screen.getByRole('textbox', { name: 'Trade note' }), 'Original plan: wait for the announcement{enter}Actual fill: before the announcement');
  await user.click(screen.getByRole('button', { name: 'Compare notes' }));
  expect(Boolean(screen.getByText('From your notes')), true);
  expect(Boolean(screen.getByText('Actual fill: before the announcement')), true);
  expect(Boolean(screen.getByText('Missing from your notes')), true);
  await user.click(screen.getByRole('button', { name: 'Read from Polymarket' }));
  expect(Boolean(screen.getByRole('textbox', { name: /Polymarket profile URL/ })), true);
  expect(screen.queryByRole('textbox', { name: 'Trade note' }), null);
  await user.click(screen.getByRole('button', { name: 'Back to trade review' }));
  await user.click(screen.getByRole('button', { name: 'Edit note' }));
  expect(screen.getByRole('textbox', { name: 'Trade note' }).value, 'Original plan: wait for the announcement\nActual fill: before the announcement');
  expect(Boolean(screen.getByText('From your notes')), true);
});

test('the sample card accepts native touch swipes and leaves vertical scrolling alone', async () => {
  const user = userEvent.setup({ document });
  render(createElement(TradeReview));
  await user.click(screen.getByRole('button', { name: 'Try an example' }));
  const card = screen.getByRole('article', { name: /Twin judgment card/ });
  function touch(type, x, y) {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    const point = { identifier: 0, clientX: x, clientY: y };
    Object.defineProperties(event, {
      touches: { value: type === 'touchend' ? [] : [point] },
      changedTouches: { value: [point] },
    });
    card.dispatchEvent(event);
    return event.defaultPrevented;
  }
  touch('touchstart', 130, 10);
  expect(touch('touchmove', 128, 85), false);
  touch('touchend', 127, 90);
  expect(card.dataset.feedback, undefined);

  touch('touchstart', 130, 10);
  expect(touch('touchmove', 65, 12), true);
  touch('touchend', 52, 13);
  await screen.findByRole('textbox', { name: 'Reply to Twin' });
  expect(card.dataset.feedback, 'correct');

  touch('touchstart', 60, 12);
  touch('touchmove', 125, 12);
  touch('touchend', 140, 12);
  await screen.findByText('You confirmed that the price rise prompted you to add.');
  expect(card.dataset.feedback, 'confirm');
});

test('guided review prepares evidence while a private draft has focus and regroups after correction', async t => {
  const user = userEvent.setup({ document });
  const pending = Promise.withResolvers();
  t.mock.method(globalThis, 'fetch', () => pending.promise);
  render(createElement('div', null,
    createElement('textarea', { 'aria-label': 'Private draft' }),
    createElement(TradeReview, { initiallyOpen: true, guidedSources: true })));
  expect(screen.queryByRole('button', { name: 'Try an example' }), null);
  expect(screen.queryByRole('article', { name: /Twin judgment card/ }), null);

  const link = screen.getByRole('textbox', { name: /Polymarket profile URL/ });
  await user.type(link, '0x' + 'a'.repeat(40));
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  const draft = screen.getByRole('textbox', { name: 'Private draft' });
  await user.type(draft, 'Keep this draft');
  let foreground = false;
  t.mock.method(document, 'hasFocus', () => foreground);
  await act(async () => pending.resolve(Response.json({ data: [
    { type: 'TRADE', side: 'BUY', title: 'Test outcome', timestamp: 1, price: .5, size: 10, token_id: 'yes', transaction_hash: 'first' },
    { type: 'TRADE', side: 'BUY', title: 'Test outcome', timestamp: 2, price: .55, size: 10, token_id: 'yes', transaction_hash: 'second' },
  ] })));

  const prepared = await screen.findByRole('list', { name: 'Fills Twin prepared for review' });
  expect(within(prepared).getAllByRole('listitem').length, 2);
  expect(screen.queryByRole('article', { name: /Twin judgment card/ }), null);
  expect(document.activeElement, draft);
  await user.tab();
  expect(screen.queryByRole('article', { name: /Twin judgment card/ }), null);
  foreground = true;
  await act(async () => window.dispatchEvent(new window.Event('focus')));
  const card = await screen.findByRole('article', { name: /Twin judgment card/ });
  await user.click(within(card).getByRole('button', { name: 'Needs correction' }));
  expect(screen.queryByRole('textbox', { name: 'Reason for this review' }), null);
  await user.click(screen.getByRole('button', { name: /One order, two fills/ }));
  await screen.findByText(/0.525 pUSD weighted average/);
  expect(within(prepared).getAllByRole('listitem').length, 1);
  await user.click(within(card).getByRole('button', { name: 'Right', exact: true }));
  expect(within(prepared).getAllByRole('listitem').length, 1);
  expect(draft.value, 'Keep this draft');
});

test('local evidence can be corrected through a replay without typing or a network request', async t => {
  const user = userEvent.setup({ document });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  render(createElement(TradeReview, { initiallyOpen: true, guidedSources: true }));
  await user.click(screen.getByRole('button', { name: 'Other trading information' }));
  await user.click(screen.getByRole('button', { name: 'Paste an existing excerpt' }));
  await user.type(screen.getByRole('textbox', { name: 'Trading information' }), 'I wait for a pullback before buying.');
  await user.click(screen.getByRole('button', { name: /Send to Twin/ }));
  const card = await screen.findByRole('article', { name: /Twin judgment card/ });
  await within(card).findByRole('heading', { name: /wait for a pullback/ });
  await user.click(within(card).getByRole('button', { name: 'Needs correction' }));
  expect(screen.queryByRole('textbox', { name: 'Correct my understanding' }), null);
  await screen.findByRole('slider', { name: 'When would you buy?' });
  await user.click(screen.getByRole('button', { name: 'Leave this judgment open' }));
  await screen.findByText(/won’t treat this prediction as confirmed/);
  await user.click(screen.getByRole('button', { name: /Back to judgment/ }));
  await user.click(within(card).getByRole('button', { name: 'Needs correction' }));
  await screen.findByRole('slider', { name: 'When would you buy?' });
  await user.click(screen.getByRole('button', { name: 'Select price rises' }));
  await user.click(screen.getByRole('button', { name: /Mark my entry/ }));
  await user.click(screen.getByRole('button', { name: 'Keep only my first move' }));
  await within(screen.getByRole('region', { name: 'Compare the next decision' })).findByText(/In this hypothetical situation, I chose: Buy on the rise/);
  expect(fetch.mock.callCount(), 0);
});

test('local model abstains on fills without a decision condition and rejects evidence it invented', async t => {
  const { readLocalDecision } = await import('../src/twin-workspace/local-decision-model.ts');
  const request = t.mock.method(globalThis, 'fetch', async () => Response.json({
    message: { content: JSON.stringify({
      quote: 'I buy only after my limit is crossed.',
      prediction: 'You would wait for your limit.',
    }) },
  }));
  const signal = new AbortController().signal;
  expect(await readLocalDecision('The venue lists ten completed fills.', signal), undefined);
  expect(request.mock.callCount(), 0);
  expect(await readLocalDecision('I reduce my size when volatility increases.', signal), undefined);
  expect(request.mock.callCount(), 1);
  expect(request.mock.calls[0].arguments[0], 'http://127.0.0.1:11434/api/chat');
});

test('non-Polymarket CSV review cites two local fills and separates fills from motive', async t => {
  const user = userEvent.setup({ document });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  render(createElement(TradeReview, { initiallyOpen: true, guidedSources: true }));
  await user.click(screen.getByRole('button', { name: 'Other trading information' }));
  await user.click(screen.getByRole('button', { name: 'Paste an existing excerpt' }));
  const input = screen.getByRole('textbox', { name: 'Trading information' });
  const fillRows = [
    '2026-11-01T10:00:00Z,"Index, monthly",BUY,102',
    '2026-11-02T11:00:00Z,"Index, monthly",BUY,105',
  ];
  await user.type(input, ['timestamp,symbol,side,price', ...fillRows].join('\n'));
  await user.click(screen.getByRole('button', { name: /Send to Twin/ }));
  await screen.findByText('I found two buys in the same market');
  const card = await screen.findByRole('article', { name: /Twin judgment card/ });
  await within(card).findByRole('heading', { name: /could also come from one order/ });
  for (const row of fillRows) expect(document.querySelector('.twin-local-fill-rows').textContent.includes(row), true);
  expect(fetch.mock.callCount(), 0);
});

test('identifies a localized event link and keeps it available for replacement', async t => {
  const user = userEvent.setup({ document });
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  render(createElement(TradeReview, { initiallyOpen: true, guidedSources: true }));
  const field = screen.getByRole('textbox', { name: /Polymarket profile URL/ });
  const eventURL = 'https://polymarket.com/zh/event/jensen-huang-out-as-nvidia-ceo';
  await user.type(field, eventURL);
  await user.click(screen.getByRole('button', { name: 'Read public trades' }));
  expect(screen.getByRole('alert').textContent.includes('This link opens a Polymarket market.'), true);
  expect(field.value, eventURL);
  expect(field.getAttribute('aria-invalid'), 'true');
  expect(fetch.mock.callCount(), 0);
});

test('account calibration previews the exact example before initiating an upload', async () => {
  const user = userEvent.setup({ document });
  const { DecisionFollowUp } = await import('../src/twin-workspace/decision-follow-up.tsx');
  const requests = [];
  const next = [];
  render(createElement('div', {
    className: 'twin-root',
    ref: node => node?.addEventListener('twin:save-calibration', event => {
      requests.push(event.detail.example);
      event.detail.resolve(event.detail.example.id);
    }, { once: true }),
  }, createElement(DecisionFollowUp, {
    basis: 'I wait for a pullback before buying.',
    prediction: 'You might wait for a pullback before buying.',
    persistent: true,
    onRemember() {},
    onNext: (...value) => next.push(value),
  })));
  expect(screen.getByRole('button', { name: /Mark my entry/ }).disabled, true);
  expect(screen.getByRole('slider', { name: 'When would you buy?' }).getAttribute('aria-valuetext'), 'No move selected');
  await user.click(screen.getByRole('button', { name: 'Select price rises' }));
  await user.click(screen.getByRole('button', { name: /Mark my entry/ }));
  expect(screen.queryByRole('textbox'), null);
  const slider = screen.getByRole('slider', { name: 'Your move with new information' });
  slider.value = '1';
  slider.dispatchEvent(new window.Event('input', { bubbles: true }));
  await user.click(screen.getByRole('button', { name: /same move|Use this comparison/ }));
  const preview = await screen.findByRole('region', { name: 'Review training example' });
  expect(requests.length, 0);
  expect(next.length, 0);
  await user.click(within(preview).getByRole('button', { name: 'Later' }));
  await user.click(screen.getByRole('button', { name: 'Resume reviewing your example' }));
  await user.click(screen.getByRole('button', { name: 'Back to comparison' }));
  expect(Boolean(screen.getByRole('slider', { name: 'Your move with new information' })), true);
  await user.click(screen.getByRole('button', { name: 'Keep only my first move' }));
  expect(requests.length, 0);
  await user.click(within(screen.getByRole('region', { name: 'Review training example' })).getByRole('button', { name: 'Add to my training set and continue' }));
  expect(requests.length, 1);
  expect(requests[0].ownerAction, 'Buy on the rise');
  expect(requests[0].reason, 'In this hypothetical situation, I chose: Buy on the rise.');
  expect(next[0][2].reason, requests[0].reason);
});

test('an observed correction opens its training preview without requesting an upload', async () => {
  const user = userEvent.setup({ document });
  const { DecisionFollowUp } = await import('../src/twin-workspace/decision-follow-up.tsx');
  const uploads = [];
  const continuations = [];
  const observed = {
    scenario: 'Two fills bought the same outcome.',
    twinAction: 'Two planned entries',
    ownerAction: 'One order',
    reason: 'Both fills came from one order.',
    matched: false,
  };
  render(createElement('div', {
    className: 'twin-root',
    ref: node => node?.addEventListener('twin:save-calibration', event => uploads.push(event.detail.example)),
  }, createElement(DecisionFollowUp, {
    basis: 'Public trade review', prediction: 'Check the order first', observed, persistent: true,
    onNext: (...value) => continuations.push(value),
  })));
  const preview = await screen.findByRole('region', { name: 'Review training example' });
  await within(preview).findByText(observed.reason);
  expect(uploads.length, 0);
  await user.click(within(preview).getByRole('button', { name: 'Later' }));
  await user.click(screen.getByRole('button', { name: 'Resume reviewing your example' }));
  await user.click(screen.getByRole('button', { name: 'Continue on this device' }));
  expect(continuations[0][2].ownerAction, observed.ownerAction);
  expect(uploads.length, 0);
});

test('a comparison cannot be revised while its selected example is saving', async () => {
  const user = userEvent.setup({ document });
  const { DecisionFollowUp } = await import('../src/twin-workspace/decision-follow-up.tsx');
  let request;
  let revisions = 0;
  const saved = [];
  render(createElement('div', {
    className: 'twin-root',
    ref: node => node?.addEventListener('twin:save-calibration', event => { request = event.detail; }),
  }, createElement(DecisionFollowUp, {
    basis: 'Replay comparison', prediction: 'You might wait', persistent: true,
    observed: { scenario: 'Compare the decisions', twinAction: 'Wait', ownerAction: 'Different approach', matched: false, reason: 'Earlier choice was to act.' },
    onObservedBack: () => { revisions++; },
    onNext: (...value) => saved.push(value),
  })));
  const preview = screen.getByRole('region', { name: 'Review training example' });
  const revise = within(preview).getByRole('button', { name: 'Change my answer' });
  await user.click(revise);
  expect(revisions, 1);
  await user.click(within(preview).getByRole('button', { name: 'Add to my training set and continue' }));
  expect(revise.disabled, true);
  await user.click(revise);
  expect(revisions, 1);
  expect(request.example.ownerAction, 'Different approach');
  await act(async () => request.resolve(request.example.id));
  expect(saved[0][2].platformExampleId, request.example.id);
});

test('a training receipt can revoke one example while keeping the local review', async () => {
  const user = userEvent.setup({ document });
  const { TrainingExamples } = await import('../src/twin-workspace/training-examples.tsx');
  let saved;
  let savedId;
  let removedId;
  render(createElement('div', {
    className: 'twin-root',
    ref: node => {
      node?.addEventListener('twin:save-calibration', event => {
        saved = event.detail.example;
        savedId = saved.id;
        event.detail.resolve(savedId);
      }, { once: true });
      node?.addEventListener('twin:list-calibration', event => {
        event.detail.resolve([{ ...saved, id: 'another-example', scenario: 'An unrelated scenario' }, saved]);
      });
      node?.addEventListener('twin:remove-calibration', event => {
        removedId = event.detail.removeId;
        event.detail.resolve(removedId);
      }, { once: true });
    },
  }, createElement(TradeReview, { initiallyOpen: true, guidedSources: true, persistentUnderstanding: true }), createElement(TrainingExamples)));
  await user.click(screen.getByRole('button', { name: 'Select price rises' }));
  await user.click(screen.getByRole('button', { name: /Mark my entry/ }));
  await user.click(screen.getByRole('button', { name: 'Keep only my first move' }));
  await user.click(screen.getByRole('button', { name: 'Add to my training set and continue' }));
  const review = await screen.findByRole('region', { name: 'Compare the next decision' });
  await within(review).findByText('Saved to your Twin’s training set.');
  await user.click(within(review).getByRole('button', { name: 'View saved example' }));
  const entry = await screen.findByText(saved.scenario, { selector: 'summary' });
  expect(entry.parentElement.open, true);
  expect(document.activeElement, entry);
  expect(screen.getByText('An unrelated scenario').parentElement.open, false);
  await user.click(within(review).getByRole('button', { name: 'Remove example' }));
  await within(review).findByText('Removed from your training set.');
  expect(removedId, savedId);
  expect(within(review).queryByRole('button', { name: 'Remove example' }), null);
  await within(review).findByText('In this hypothetical situation, I chose: Buy on the rise.');
});

test('training examples load on open and let the owner remove a saved example', async () => {
  const user = userEvent.setup({ document });
  const { TrainingExamples } = await import('../src/twin-workspace/training-examples.tsx');
  let loads = 0;
  let removed;
  render(createElement('div', {
    className: 'twin-root',
    ref: node => {
      node?.addEventListener('twin:list-calibration', event => {
        loads += 1;
        event.detail.resolve([{ id: 'example-1', scenario: 'New evidence arrives', twinAction: 'Wait', ownerAction: 'Act', reason: 'Starting plan changed.' }]);
      });
      node?.addEventListener('twin:remove-calibration', event => {
        removed = event.detail.removeId;
        event.detail.resolve(removed);
      });
    },
  }, createElement(TrainingExamples)));
  expect(loads, 0);
  await user.click(screen.getByText('My training examples'));
  await user.click(await screen.findByText('New evidence arrives'));
  await screen.findByText('Starting plan changed.');
  await user.click(screen.getByRole('button', { name: 'Remove this example' }));
  await screen.findByText('No examples saved yet.');
  expect(removed, 'example-1');
});

test('a replay-to-file comparison saves only the confirmed sample and can be withdrawn', async t => {
  const { createApp, openDatabase } = await import('../server/app.mjs');
  const db = openDatabase(':memory:');
  const identity = async token => {
    if (token !== 'comparison-owner') throw new Error('Unexpected fixture token');
    return { subject: token, email: 'comparison@example.test', wallets: [] };
  };
  const server = createApp({ db, identity, config: { appId: 'fixture-app' } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const endpoint = '/api/companion/calibration-examples';
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { Authorization: 'Bearer comparison-owner', 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Fixture API rejected ${method} ${path}: ${response.status}`);
    return response.json();
  };
  await request('/api/me', 'PUT', { username: 'Comparison owner' });
  const { companion } = await request('/api/companion', 'PUT', { name: 'Comparison Twin' });
  const twinId = companion.ai_id;
  const listPath = endpoint + '?' + new URLSearchParams({ twinId });
  let lastExample;
  render(createElement('div', {
    className: 'twin-root',
    ref: node => {
      node?.addEventListener('twin:save-calibration', event => {
        lastExample = event.detail.example;
        void request(endpoint, 'POST', { ...lastExample, twinId, consent: 'personal-training-v1' })
          .then(result => event.detail.resolve(result.id), event.detail.reject);
      });
      node?.addEventListener('twin:remove-calibration', event => {
        void request(endpoint, 'DELETE', { id: event.detail.removeId, twinId })
          .then(() => event.detail.resolve(event.detail.removeId), event.detail.reject);
      });
    },
  }, createElement(TradeReview, { initiallyOpen: true, guidedSources: true, persistentUnderstanding: true })));
  const user = userEvent.setup({ document });
  await user.click(screen.getByRole('button', { name: 'Select price rises' }));
  await user.click(screen.getByRole('button', { name: /Mark my entry/ }));
  await user.click(screen.getByRole('button', { name: 'Keep only my first move' }));
  await user.click(screen.getByRole('button', { name: 'Continue on this device' }));
  const file = new window.File(['I wait for a pullback before buying.'], 'decision.txt', { type: 'text/plain' });
  file.text = async () => 'I wait for a pullback before buying.';
  const picker = screen.getByRole('region', { name: 'Other trading information' }).querySelector('input[type=file]');
  await user.upload(picker, file);
  await screen.findByText('decision.txt', { exact: true });
  await user.click(screen.getByRole('button', { name: /Send to Twin/ }));
  await user.click(await screen.findByRole('button', { name: 'Different approach' }));
  const preview = await screen.findByRole('region', { name: 'Review training example' });
  expect(lastExample, undefined);
  expect((await request(listPath)).examples.length, 0);
  await user.click(within(preview).getByRole('button', { name: 'Add to my training set and continue' }));
  const comparison = screen.getByLabelText('Compare with the earlier choice');
  await within(comparison).findByText('Saved to your Twin’s training set.');
  const { examples } = await request(listPath);
  expect(examples.length, 1);
  expect(examples[0].ownerAction, 'Different approach');
  expect(examples[0].reason, lastExample.reason);
  expect(Object.hasOwn(lastExample, 'rawFile'), false);
  await user.click(within(comparison).getByRole('button', { name: 'Remove example' }));
  await within(comparison).findByRole('region', { name: 'Review training example' });
  expect((await request(listPath)).examples.length, 0);
});

test('an account can review a practice draft before sending any training request', async t => {
  const priorUrl = window.location.href;
  window.history.replaceState(null, '', '/twin?resume-example=1');
  t.after(() => window.history.replaceState(null, '', priorUrl));
  const key = 'loka.twin.trial-example';
  window.sessionStorage.setItem(key, JSON.stringify({
    scenario: 'The price rises and then pulls back.', twinAction: 'Wait',
    ownerAction: 'Stay out', matched: false, reason: 'In this hypothetical situation, I chose to stay out.',
    expiresAt: Date.now() + 60_000,
  }));
  const request = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected upload'); });
  render(createElement(TradeReview, { initiallyOpen: true, guidedSources: true, persistentUnderstanding: true }));
  const draft = await screen.findByRole('region', { name: 'Resume your practice example' });
  await within(draft).findByText('Stay out', { exact: true });
  const user = userEvent.setup({ document });
  await user.click(within(draft).getByRole('button', { name: 'Continue on this device' }));
  await within(screen.getByRole('region', { name: 'Compare the next decision' })).findByText(/In this hypothetical situation/);
  expect(window.sessionStorage.getItem(key), null);
  expect(request.mock.callCount(), 0);
});

test('retrying a practice draft after reloading reuses the same training example ID', async t => {
  const priorUrl = window.location.href;
  window.history.replaceState(null, '', '/twin?resume-example=1');
  t.after(() => window.history.replaceState(null, '', priorUrl));
  const id = 'c82f89c3-6dbc-41ef-b41d-77ff8be4a950';
  window.sessionStorage.setItem('loka.twin.trial-example', JSON.stringify({
    id, scenario: 'The price rises and then pulls back.', twinAction: 'Wait',
    ownerAction: 'Stay out', matched: false, reason: 'In this hypothetical situation, I chose to stay out.',
    expiresAt: Date.now() + 60_000,
  }));
  const saves = [];
  const user = userEvent.setup({ document });
  for (const attempt of [1, 2]) {
    const view = render(createElement('div', {
      className: 'twin-root',
      ref: node => node?.addEventListener('twin:save-calibration', event => {
        saves.push(event.detail.example);
        if (attempt === 1) event.detail.reject(new Error('The response was interrupted.'));
        else event.detail.resolve(event.detail.example.id);
      }),
    }, createElement(TradeReview, { initiallyOpen: true, guidedSources: true, persistentUnderstanding: true })));
    const draft = await screen.findByRole('region', { name: 'Resume your practice example' });
    expect(saves.length, attempt - 1);
    await user.click(within(draft).getByRole('button', { name: 'Add to my training set and continue' }));
    if (attempt === 1) await within(draft).findByRole('alert');
    else await screen.findByText('Saved to your Twin’s training set.');
    view.unmount();
  }
  expect(saves[0].id, id);
  expect(saves[1].id, id);
  expect(saves[1].ownerAction, 'Stay out');
});
