# Токены и окружение для DSH

[English](README.md) | Русский

Плагин `@pnpwin/dsh-token-vault`: интерфейс **Настройки → Токены и окружение**, единый источник `NAME → TOKEN`, выборочная передача без глобального `process.env`.

## Совместимость и установка

Проверенная версия DSH — **0.2.2-rc.1**; требуется Node.js **22+**. Runtime-зависимостей и install scripts нет: используются штатные Host-сервисы DSH, а не скопированный MCP SDK.

Установите bundle через **DSH Plugin Manager**, указав:

```text
github:pnpwin/dsh-token-vault#v1.0.2
```

Bundle добавляет ряд `pnpwin-token-vault` и страницу Client UI. Он не включает MCP-серверы и не меняет их авторизацию. Замена существующей установки должна сохранять пользовательскую конфигурацию и credentials; не редактируйте профиль вручную. Проверяйте результат applied/restart от Plugin Manager и работу существующей страницы, а не только наличие plugin row.

## Добавление

Введите POSIX-имя (например `GITHUB_TOKEN`) и непустое значение. Секреты вводите в интерфейсе, **не в чате**. Можно заменить значение или удалить запись с подтверждением. Поиск и список не загружают сохранённые значения в браузер. «Показать ввод» раскрывает только текущий ввод, не сохранённый токен.

Данные сохраняются через штатный `ctx.credentials.set(NAME, value)`. Поэтому имя доступно и существующим потребителям `ctx.credentials.resolve(NAME)`, например через `apiKeyEnv` модели. Секреты не сохраняются в конфигурации плагина. Для перечисления имён используются несекретные record-маркеры с обратимым ASCII-hex id: `pnpwin-token-vault/n-…`. Это соблюдает грамматику DSH CredentialKey и различает регистр.

Имена общие с другими credentials DSH. Замена затрагивает всех потребителей этого имени. При удалении возможен fallback из launch environment / `.env`; интерфейс сообщает об этом. Удаление записи — не отзыв токена у провайдера. Сбой сохранения после записи маркера оставляет видимую запись без значения, которую можно сохранить повторно или удалить. Межпроцессный CAS credentials API не поддерживает: одновременно менять одно имя из нескольких интерфейсов не следует.

## Bash и skills

Скажите агенту: **«Выполни `gh api user` с `GITHUB_TOKEN` из хранилища»**. Агент вызывает:

```js
vault_run({
  names: ['GITHUB_TOKEN'],
  command: 'gh api user',
  description: 'Проверить авторизацию GitHub'
})
```

- Подтверждение DSH на каждый запуск; отказ, отсутствие answerer или отмена запрещают запуск.
- Только перечисленные имена передаются через `env` одной команде, не текстом команды и не глобально.
- Текущие sandbox mode, session workspace, рабочая директория и сигнал отмены сохраняются. Повышения sandbox-прав здесь нет: после sandbox denial нельзя обходить запрет другим инструментом.
- Только foreground; default timeout 30 секунд, максимум 120 секунд, процесс останавливается по таймауту.
- `vault_list({})` возвращает только имена и configured state.
- Skills — инструкции, не отдельный runtime. Если skill вызывает shell-скрипт, он запускает его через `vault_run`; скрипт читает обычный `os.environ['NAME']` / `$NAME`.
- Обычный `bash`, уже открытый терминал и запущенные раньше процессы автоматически новые переменные не получают.

## MCP: токен нужен в параметре конкретного вызова

Сначала загрузите нужный MCP tool штатным механизмом DSH. Пример **условного** инструмента, принимающего аргумент `token`:

```js
vault_call({
  tool: 'mcp__example__request',
  arguments: { token: '', query: 'example' },
  bindings: [{ name: 'API_TOKEN', path: ['token'] }]
})
```

Для вложенного поля используйте `path: ['headers', 'Authorization']`, `prefix: 'Bearer '`. Промежуточные объекты должны существовать. Подстановка происходит на Host, а исходный model tool call содержит только имя и путь. Внутренний вызов проходит публичные стадии `ToolExecutionPipeline.prepare → dispatch → complete` с теми же agent/toolSet и parent/root identity, валидацией схемы, pre-execute policy и guards. Это работает для Native и PTC без нового root-вызова, который PTC ограничивает `run_code`. Expanded root call/result events не записываются. Обёртка возвращает JSON-batch с маскированием прямых повторов токенов. Необработанные additional contexts не инжектируются отдельно.

Инструмент не может дать доступ к скрытому/неразрешённому MCP. Он не меняет транспортную авторизацию уже подключённого MCP-сервера.

## Lazy Discovery: независимая интеграция

[Lazy Discovery v1.2.4](https://github.com/pnpwin/dsh-lazy-discovery/tree/v1.2.4) поддерживает сохранённые здесь native credentials без зависимости от пакета Vault.

1. Сохраните значение в **Настройки → Токены и окружение**.
2. Откройте **Настройки → Авторизация MCP**.
3. Для нужного сервера выберите Bearer token / HTTP-заголовки либо stdio env и укажите **имя** credential.
4. Подтвердите передачу выбранному назначению и сохраните привязку. Секретное значение в настройках Lazy не вводится.

Смена значения в Vault инвалидирует только связанные Lazy-подключения и каталоги; новое соединение создаётся при следующем обращении. Не включайте eager `token-vault/mcp` для того же serverName рядом с Lazy.

Vault необязателен: без него Lazy принимает имя вручную и использует штатный DSH credentials provider с environment/dotenv fallbacks. Отключение Vault UI не удаляет значения. Для запрета дальнейшего использования независимо от fallback отключите соответствующий MCP-сервер; удаление верхнего сохранённого слоя не равно отзыву токена.

Необязательный names-only API для сторонних UI: аутентифицированный `GET /api/token-vault/list` возвращает `{ entries: [{ name, configured, writable }] }`. Отсутствие этого endpoint должно оставлять ручной ввод имени работоспособным. API чтения секретного значения в браузер нет.

## MCP: авторизация при подключении

Дополнительный Host entry point `@pnpwin/dsh-token-vault/mcp` оборачивает **установленный нативный MCP client** DSH. Новый MCP-клиент или SDK не скачивается. Адаптер устанавливается тем же bundle, но сам по себе не активирует ни одного сервера. Существующие MCP-конфигурации не изменяются.

В отдельном bundle/композиции используйте этот ряд **вместо** нативного ряда для того же `serverName`:

```yaml
- id: github-with-vault
  name: '@pnpwin/dsh-token-vault/mcp'
  config:
    mcp:
      serverName: github
      transport: streamable-http
      url: https://api.githubcopilot.com/mcp/
    headerRefs:
      Authorization:
        name: GITHUB_TOKEN
        prefix: 'Bearer '
```

Пример stdio (command/args выберите для реального MCP-сервера):

```yaml
- id: local-api-with-vault
  name: '@pnpwin/dsh-token-vault/mcp'
  config:
    mcp:
      serverName: local-api
      transport: stdio
      command: your-mcp-server
      args: []
    envRefs:
      SERVICE_API_KEY: API_TOKEN
```

Ключ слева — имя переменной в MCP-процессе, справа — имя в хранилище. Заголовки поддерживаются только для Streamable HTTP, env — только для stdio. `mcp` валидирует штатный MCP client. Adapter ждёт готовности нативного клиента (`failOnStartupError: true`). При изменении credential клиент перезапускается с новым значением; удаление/ошибка закрывают старое подключение. Несекретные настройки не переписываются, значения живут только в runtime child fiber. Не храните токены прямо в `mcp.env` / `mcp.headers`.

## Host-плагины

Нативный API — предпочтительный путь, с повторным resolve при каждой операции:

```js
export const inject = ['credentials'];
export async function apply(ctx) {
  // Внутри операции:
  const credential = await ctx.credentials.resolve('GITHUB_TOKEN');
  if (!credential) throw new Error('GITHUB_TOKEN is not configured');
  // Передать credential.value выбранному SDK; не логировать и не добавлять в prompt.
}
```

Экспорт `@pnpwin/dsh-token-vault/api` содержит `resolveEnvironment(ctx, names)` для потребителей bundle, которым нужно разрешать только зарегистрированные в vault имена.

## Ограничения безопасности

- Штатный local credentials provider использует локальный файл с правами владельца, **без шифрования**. Это не OS Keychain и не KMS. При другом credentials provider действуют его гарантии.
- Это не изоляция от агента, процессов вашего OS-пользователя, доверенных Host-плагинов или MCP-получателя токена. Передача токена даёт вызываемой программе возможность использовать/передать его.
- Прямые повторы значений маскируются в результатах `vault_run` и `vault_call` (в том числе canonical JSON). Это best effort, не защита от кодирования, разбиения, binary/image output или преобразованных токенов.
- Не используйте `env`, `printenv`, `set -x`, `curl -v`, дампы заголовков или debug-логи для секретов. Raw subprocess output/spill, сторонние event listeners, MCP server instructions, SDK/client diagnostics, файлы и удалённые сервисы могут сохранить значение до маскирования. Нативный MCP-адаптер использует собственный pipeline DSH; его outputs/instructions не проходят vault-маскирование.
- Нет инструмента чтения значения в модель и нет save-token tool. Добавление/замена и подтверждение удаления выполняются через аутентифицированный UI. Аутентифицированный owner API обладает теми же правами; это не отдельная user-presence/OS-auth граница.
- Пустые значения не поддерживаются нативным credential reference store. Префикс `DSH_*` и имена прототипов зарезервированы плагином.

## Проверка

Весь исполняемый код и build/helpers находится в `src/`; существующие каталоги `tests/` и `locale/` не переименованы. Поддерживаемые entry points заданы в package exports, а не в устаревших root-файлах. Правила структуры сохранены в [AGENTS.md](AGENTS.md), происхождение исходников — в [UPSTREAM.md](UPSTREAM.md).

```sh
npm run build
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

Build/check не генерирует runtime-файлы: проверяются синтаксис, root allowlist, package exports, включение ресурсов в package.files и EN/RU метаданные. Перед релизом отдельно проверьте фактический packed file list.

Тесты используют только искусственные значения и mock providers. Они покрывают грамматику record keys, отсутствие секретов в inventory, замену/удаление, отказ approval, sandbox/cwd propagation, отмену/таймауты DTO, scoped MCP dispatch, маскирование, запрет prototype pollution, ограничение тела HTTP и жизненный цикл MCP. Live UI, нативный sandbox и нативный MCP protocol требуют отдельной проверки в текущем DSH.

Иконка оригинальная, распространяется по MIT вместе с плагином. Runtime-зависимостей и install scripts нет. Локальная установка через DSH Plugin Manager с абсолютным путём к каталогу bundle.
