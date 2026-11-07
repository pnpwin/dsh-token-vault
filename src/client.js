window.__ModuleLoader__.load({
  id: '@pnpwin/dsh-token-vault',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useSyncExternalStore } = React;
    const texts = {
      en: {
        title: 'Tokens and environment', subtitle: 'One named credential source for commands, skills, MCP and Host plugins.',
        storage: 'Stored in the native DSH credentials store. The local provider uses an owner-only file, not encryption. Tools running as your OS user can read it. This vault is not a security boundary against the agent.',
        scope: 'Names share the native credentials namespace and may also be used by Models or other plugins. Nothing is exported globally. Every command or MCP argument injection needs approval.',
        add: 'Add a variable', edit: 'Replace value', name: 'Name', value: 'Token or environment value', save: 'Save', cancel: 'Cancel', refresh: 'Refresh', search: 'Filter names', empty: 'No saved variables yet.', noMatches: 'No matching names.', loading: 'Loading…', ready: 'Configured', missing: 'Not configured', replace: 'Replace', remove: 'Delete', confirm: 'Delete the stored value? Other DSH consumers using this name will be affected.', yes: 'Delete value', saved: 'Saved. Future operations use the new value.', deleted: 'Stored value deleted.', ambient: 'Stored value deleted, but an environment or .env fallback still supplies this name.',
        replaceAck: 'I understand this replaces the shared credential used by any DSH consumer of this name.',
        nameHint: 'POSIX identifier, e.g. GITHUB_TOKEN. DSH_* names are reserved. Maximum 128 characters.',
        valueHint: 'Non-empty text, up to 32 KiB. Existing values are never downloaded to this page. Paste new values here, not in chat.',
        show: 'Show draft', hide: 'Hide draft', usage: 'How to use', usageText: 'Ask DSH to use a named token: “Run gh api user with GITHUB_TOKEN from the vault”. Skills use the same tools. For MCP startup auth, configure the optional adapter shown below; existing MCP connections are not modified.',
        commands: 'One command (selected environment only)', plugins: 'Host plugin (resolve per operation)', mcp: 'MCP connection (explicit adapter)', mcpCall: 'One MCP call (argument substitution)',
        caution: 'Direct echoes of injected values are masked in vault tool results. Encoded, split or transformed values, external diagnostics, files and remote services are not protected. Never print tokens or use shell tracing.',
        'error.invalid-name': 'Invalid name. Use letters, digits and underscores; do not use DSH_*.',
        'error.invalid-value': 'Enter non-empty text without NUL, at most 32 KiB.',
        'error.already-exists': 'This credential already exists. Confirm replacement below.',
        'error.read-only': 'The credential store is read-only.', 'error.not-found': 'This vault entry no longer exists. Refresh the list.',
        'error.invalid-request': 'Invalid request.', 'error.request-too-large': 'Request is too large.',
        'error.operation-failed': 'Could not complete the operation. Check the credentials provider and plugin status.',
        'error.transport': 'Cannot reach the vault. Reload the page or check plugin status.',
      },
      ru: {
        title: 'Токены и окружение', subtitle: 'Именованные credentials для команд, skills, MCP и Host-плагинов.',
        storage: 'Данные хранятся в штатном credentials-хранилище DSH. Локальный провайдер использует файл с доступом только владельцу, без шифрования. Инструменты от имени вашего пользователя ОС могут прочитать его. Это не граница защиты от агента.',
        scope: 'Имена общие со штатными credentials: их могут использовать модели и другие плагины. Глобальный экспорт отключён. Передача в команду или параметры MCP требует подтверждения.',
        add: 'Добавить переменную', edit: 'Заменить значение', name: 'Имя', value: 'Токен или значение переменной', save: 'Сохранить', cancel: 'Отмена', refresh: 'Обновить', search: 'Фильтр по имени', empty: 'Сохранённых переменных пока нет.', noMatches: 'Ничего не найдено.', loading: 'Загрузка…', ready: 'Настроено', missing: 'Нет значения', replace: 'Заменить', remove: 'Удалить', confirm: 'Удалить сохранённое значение? Это затронет другие компоненты DSH, использующие это имя.', yes: 'Удалить значение', saved: 'Сохранено. Следующие операции используют новое значение.', deleted: 'Сохранённое значение удалено.', ambient: 'Сохранённое значение удалено, но это имя всё ещё доступно из окружения или .env.',
        replaceAck: 'Я понимаю, что замена изменит общий credential для всех компонентов DSH, использующих это имя.',
        nameHint: 'POSIX-имя, например GITHUB_TOKEN. Префикс DSH_* зарезервирован. Не более 128 символов.',
        valueHint: 'Непустой текст до 32 КиБ. Существующие значения никогда не загружаются на эту страницу. Вставляйте токены здесь, а не в чате.',
        show: 'Показать ввод', hide: 'Скрыть ввод', usage: 'Как использовать', usageText: 'Попросите DSH: «Выполни gh api user с GITHUB_TOKEN из хранилища». Skills используют те же инструменты. Для авторизации MCP при подключении настройте адаптер ниже: существующие подключения не изменяются.',
        commands: 'Одна команда (только выбранные переменные)', plugins: 'Host-плагин (получение при каждой операции)', mcp: 'Подключение MCP (явный адаптер)', mcpCall: 'Один MCP-вызов (подстановка в параметры)',
        caution: 'Прямые повторы переданных значений маскируются в результатах vault-инструментов. Кодированные, разделённые или преобразованные значения, сторонняя диагностика, файлы и удалённые сервисы не защищены. Не печатайте токены и не включайте трассировку shell.',
        'error.invalid-name': 'Некорректное имя. Используйте буквы, цифры и подчёркивания, без DSH_*.',
        'error.invalid-value': 'Нужен непустой текст без NUL, не более 32 КиБ.',
        'error.already-exists': 'Credential с таким именем уже существует. Подтвердите замену ниже.',
        'error.read-only': 'Хранилище доступно только для чтения.', 'error.not-found': 'Запись уже отсутствует. Обновите список.',
        'error.invalid-request': 'Некорректный запрос.', 'error.request-too-large': 'Слишком большой запрос.',
        'error.operation-failed': 'Не удалось выполнить операцию. Проверьте credentials-провайдер и статус плагина.',
        'error.transport': 'Нет связи с хранилищем. Обновите страницу или проверьте статус плагина.',
      },
    };
    const css = `
      .tv{font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);padding:24px clamp(16px,4vw,40px);height:100%;overflow:auto;background:var(--dsw-alias-bg-base);box-sizing:border-box}
      .tv *{box-sizing:border-box}.tv-inner{max-width:840px;margin:auto}.tv h2{font-size:20px;line-height:28px;margin:0;font-weight:600}.tv h3{font-size:14px;margin:0 0 12px;font-weight:600}
      .tv-muted{color:var(--dsw-alias-label-secondary)}.tv p{margin:8px 0 12px}.tv-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px;margin-top:16px}.tv-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.tv-row:last-child{border:0}.tv-row code{overflow-wrap:anywhere}.tv-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tv-row>div:first-child{min-width:0}.tv-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
      .tv button,.tv input{font:inherit}.tv button{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 10px;cursor:pointer}.tv button:hover{background:var(--dsw-alias-bg-layer-1)}.tv button:disabled{cursor:default;opacity:.5}.tv button:focus-visible,.tv input:focus-visible,.tv summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .tv input:not([type=checkbox]){display:block;width:100%;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);margin:6px 0}.tv label{display:block;margin-bottom:14px}.tv small{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.tv-status{font-size:12px;color:var(--dsw-alias-label-secondary)}.tv-error{color:var(--dsw-alias-state-error-primary)}.tv-notice{color:var(--dsw-alias-state-success-primary);margin-top:12px}.tv-danger{color:var(--dsw-alias-state-error-primary)!important}.tv pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-size:12px}.tv summary{cursor:pointer;font-weight:600}.tv-check{display:flex!important;gap:8px;align-items:flex-start}.tv-check input{margin-top:4px}.tv-confirm{width:100%;margin:12px 0}.tv-filter{margin-top:16px!important}
      @media(max-width:520px){.tv{padding:16px}.tv-row,.tv-head{align-items:flex-start;flex-direction:column}.tv-card{padding:14px}}
    `;
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        for (const [lang, dict] of Object.entries(texts)) ctx.effect(() => ctx.locale.register('pnpwin-token-vault', lang, dict));
        const t = ctx.locale.bind('pnpwin-token-vault');
        function Page() {
          useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
          const [entries, setEntries] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
          const [name, setName] = useState(''), [value, setValue] = useState(''), [editing, setEditing] = useState(false), [replace, setReplace] = useState(false), [show, setShow] = useState(false), [query, setQuery] = useState(''), [deleting, setDeleting] = useState(null);
          const requests = useRef(new Set()), alive = useRef(true), lock = useRef(false);
          async function request(path, body) {
            const controller = new AbortController(); requests.current.add(controller);
            const timer = setTimeout(() => controller.abort(), 20000);
            try {
              const response = await fetch(`/api/token-vault/${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
              const data = await response.json();
              if (!response.ok || data.error) throw new Error(data.error?.code ?? 'transport');
              return data;
            } catch (error) { throw new Error(Object.hasOwn(texts.en, `error.${error.message}`) ? error.message : 'transport'); }
            finally { clearTimeout(timer); requests.current.delete(controller); }
          }
          async function perform(operation) {
            if (lock.current) return;
            lock.current = true; setBusy(true); setError(''); setNotice('');
            try { await operation(); }
            catch (error) { if (alive.current) setError(error.message); }
            finally { lock.current = false; if (alive.current) setBusy(false); }
          }
          async function refresh() { const data = await request('list'); if (alive.current) setEntries(data.entries); }
          useEffect(() => { alive.current = true; void perform(refresh); return () => { alive.current = false; for (const c of requests.current) c.abort(); requests.current.clear(); }; }, []);
          function reset() { setName(''); setValue(''); setEditing(false); setReplace(false); setShow(false); }
          const filtered = (entries ?? []).filter(row => row.name.toLowerCase().includes(query.toLowerCase()));
          return h('section', { className: 'tv', 'aria-label': t('title') }, h('style', null, css), h('div', { className: 'tv-inner' },
            h('div', { className: 'tv-head' }, h('div', null, h('h2', null, t('title')), h('p', { className: 'tv-muted' }, t('subtitle'))), h('button', { disabled: busy, onClick: () => perform(refresh) }, t('refresh'))),
            h('p', { className: 'tv-muted' }, t('scope')),
            h('details', { className: 'tv-card' }, h('summary', null, t('usage')), h('p', null, t('usageText')),
              h('h3', null, t('commands')), h('pre', null, 'vault_run({ names: ["GITHUB_TOKEN"], command: "gh api user", description: "Check GitHub authentication" })'),
              h('h3', null, t('plugins')), h('pre', null, 'const hit = await ctx.credentials.resolve("GITHUB_TOKEN");\n// hit?.value — Host only; never add it to a prompt.'),
              h('h3', null, t('mcp')), h('pre', null, '- id: github-with-vault\n  name: "@pnpwin/dsh-token-vault/mcp"\n  config:\n    mcp:\n      serverName: github\n      transport: streamable-http\n      url: https://api.githubcopilot.com/mcp/\n    headerRefs:\n      Authorization:\n        name: GITHUB_TOKEN\n        prefix: "Bearer "'),
              h('h3', null, t('mcpCall')), h('pre', null, 'vault_call({ tool: "mcp__example__request", arguments: { token: "" }, bindings: [{ name: "API_TOKEN", path: ["token"] }] })'),
              h('small', null, t('caution'))),
            h('form', { className: 'tv-card', onSubmit: event => { event.preventDefault(); void perform(async () => { await request('save', { name, value, replace }); if (!alive.current) return; reset(); setNotice(t('saved')); await refresh(); }); } },
              h('h3', null, t(editing ? 'edit' : 'add')),
              h('label', null, t('name'), h('input', { value: name, disabled: busy, readOnly: editing, autoComplete: 'off', spellCheck: false, maxLength: 128, required: true, placeholder: 'GITHUB_TOKEN', onChange: e => { setName(e.target.value); setReplace(false); } }), h('small', null, t('nameHint'))),
              h('label', null, t('value'), h('input', { type: show ? 'text' : 'password', value, disabled: busy, autoComplete: 'new-password', spellCheck: false, required: true, onChange: e => setValue(e.target.value) }), h('small', null, t('valueHint'))),
              h('label', { className: 'tv-check' }, h('input', { type: 'checkbox', checked: replace, disabled: busy, onChange: e => setReplace(e.target.checked) }), h('span', null, t('replaceAck'))),
              h('div', { className: 'tv-actions' }, h('button', { type: 'submit', disabled: busy || !name || !value || editing && !replace }, t('save')), h('button', { type: 'button', disabled: busy, onClick: () => setShow(!show) }, t(show ? 'hide' : 'show')), h('button', { type: 'button', disabled: busy, onClick: reset }, t('cancel')))),
            error && h('p', { className: 'tv-error', role: 'alert' }, t(`error.${error}`)), notice && h('p', { className: 'tv-notice', role: 'status' }, notice),
            h('input', { className: 'tv-filter', value: query, placeholder: t('search'), 'aria-label': t('search'), onChange: e => setQuery(e.target.value) }),
            h('div', { className: 'tv-card', 'aria-busy': busy }, entries === null ? t('loading') : !filtered.length ? t(entries.length ? 'noMatches' : 'empty') : filtered.map(row => h('div', { key: row.name }, h('div', { className: 'tv-row' },
              h('div', null, h('code', null, row.name), h('div', { className: 'tv-status' }, t(row.configured ? 'ready' : 'missing'))),
              h('div', { className: 'tv-actions' }, h('button', { disabled: busy || !row.writable, onClick: () => { setName(row.name); setValue(''); setEditing(true); setReplace(false); setShow(false); setError(''); setNotice(''); } }, t('replace')), h('button', { className: 'tv-danger', disabled: busy || !row.writable, onClick: () => setDeleting(row.name) }, t('remove')))),
              deleting === row.name && h('div', { className: 'tv-confirm' }, h('p', null, t('confirm')), h('div', { className: 'tv-actions' }, h('button', { className: 'tv-danger', disabled: busy, onClick: () => perform(async () => { const result = await request('remove', { name: row.name }); if (!alive.current) return; setDeleting(null); if (name === row.name) reset(); setNotice(t(result.ambientRemains ? 'ambient' : 'deleted')); await refresh(); }) }, t('yes')), h('button', { disabled: busy, onClick: () => setDeleting(null) }, t('cancel'))))))),
            h('p', { className: 'tv-muted' }, t('storage')),
          ));
        }
        ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'pnpwin-token-vault', order: 35, label: () => t('title') }, Page));
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({ name: 'settings.section.icon', id: 'pnpwin-token-vault' }, () => h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true }, h('rect', { x: 4, y: 10, width: 16, height: 11, rx: 3 }), h('path', { d: 'M8 10V7a4 4 0 0 1 8 0v3M12 14v3' }))));
      },
    };
  },
});
