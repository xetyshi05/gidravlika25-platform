# Production-развёртывание

Контур рассчитан на один Linux-сервер с Docker Engine и Docker Compose v2. Наружу публикуются только порты Nginx `80/443`. PostgreSQL, API, публичный сайт, CRM и Back Office доступны только внутри Docker-сети.

## Домены и DNS

До первого запуска создайте A/AAAA-записи, указывающие на production-сервер:

- `gidravlika25.ru` и `www.gidravlika25.ru` — публичный сайт;
- `api.gidravlika25.ru` — API;
- `crm.gidravlika25.ru` — CRM;
- `bo.gidravlika25.ru` — Back Office.

На firewall оставьте доступными извне только SSH, `80/tcp` и `443/tcp`. Порт PostgreSQL не публикуется.

## Подготовка окружения

```bash
cp .env.production.example .env.production
chmod 600 .env.production
mkdir -p backups
chmod 700 backups
```

Заполните все пустые значения. Публичные домены и origin задаются только в `.env.production`; при их смене не нужно редактировать compose-файл. Для `BOOTSTRAP_SECRET`, `TOTP_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `DB_MIGRATOR_PASSWORD` и `DB_RUNTIME_PASSWORD` используйте независимые случайные значения не короче 32 символов. Пароли ролей БД подставляются в URL подключения, поэтому допустимы только `A-Z`, `a-z`, `0-9`, `_` и `-`; удобно генерировать их командой `openssl rand -hex 32`.

`NEXT_PUBLIC_*` значения встраиваются в Next.js при сборке образа. После их изменения образы нужно пересобрать.

Каждый релиз должен иметь неизменяемый тег образов, например короткий SHA коммита:

```dotenv
IMAGE_TAG=a1b2c3d
```

Не добавляйте `.env.production`, TLS-ключи или резервные копии в Git.

## Первый запуск и TLS

Сначала выпустите единый Let's Encrypt сертификат для основного домена и четырёх поддоменов:

```bash
./deploy/scripts/init-tls.sh
```

Скрипт временно запускает HTTP-only конфигурацию для ACME challenge, выпускает сертификат, затем переключает Nginx на HTTPS. Certbot проверяет продление каждые 12 часов; Nginx перечитывает сертификаты каждые 6 часов.

После выпуска сертификата обычный запуск выполняется так:

```bash
./deploy/scripts/deploy.sh
```

Миграции выполняет не API, а два одноразовых сервиса Compose, которые `deploy.sh` запускает отдельным шагом до старта новой версии (`compose run --rm migrate`); API также зависит от их успешного завершения, поэтому `compose up` не запустит его на непромигрированной схеме:

1. `db-roles` — от имени суперпользователя `POSTGRES_USER` выполняет `apps/api/prisma/database-roles.sql`: создаёт роли, выставляет им пароли из `.env.production` и передаёт владение базой, схемой `public` и всеми объектами роли `db_owner`;
2. `migrate` — образ API под ролью `migrator`: `prisma migrate deploy`, затем `apps/api/prisma/runtime-grants.sql` выдаёт права `app_runtime` на новые таблицы.

При ошибке любого шага API не перезапускается, а зависящие от него контейнеры остаются на прежней версии.

### Роли PostgreSQL

| Роль | Вход | Назначение |
|---|---|---|
| `POSTGRES_USER` | да | суперпользователь; только PostgreSQL, `db-roles` и backup |
| `db_owner` | нет | владелец базы, схемы и всех таблиц |
| `migrator` | да | миграции; каждая сессия работает как `db_owner` (`ALTER ROLE migrator SET role`) |
| `app_runtime` | да | API: только `SELECT`/`INSERT`/`UPDATE`/`DELETE` и чтение последовательностей; без DDL, `TRUNCATE`, временных таблиц и доступа к `_prisma_migrations` |

Скрипт ролей идемпотентен и выполняется при каждом deploy: он же переводит на новую схему прав существующую базу, созданную прежним deploy от суперпользователя, и базу после `restore-production.sh` (восстановление идёт с `--no-owner`). Пароль роли меняется правкой `DB_MIGRATOR_PASSWORD` или `DB_RUNTIME_PASSWORD` и повторным `./deploy/scripts/deploy.sh`.

Ручная миграция без выдачи прав оставит новые таблицы недоступными для API (`permission denied`) — запускайте миграции только через сервис `migrate`. CI прогоняет API e2e в том же режиме: миграции под `migrator`, тесты под `app_runtime` (`E2E_DATABASE_ROLES=true`, нужен одноразовый PostgreSQL, так как роли общие для кластера).

Первый deploy этой версии на существующем сервере: добавьте в `.env.production` `DB_MIGRATOR_PASSWORD` и `DB_RUNTIME_PASSWORD`; прежняя переменная `DATABASE_URL` больше не используется и её можно удалить. Откат через `rollback.sh` на теги, собранные до разделения ролей, не поддерживается: в старом образе нет сервиса миграций, а API пытался бы применять миграции сам.

Миграция завершения перехода на `Product.imageKey` автоматически переносит legacy-ключи и прерывается до удаления старого столбца, если встретит неоднозначный путь. В этом случае заполните `imageKey` для указанных товаров вручную и повторите deploy — данные старого пути не удаляются при неудачной проверке.

## Автоматическая ретенция персональных данных

`PERSONAL_DATA_RETENTION_DAYS` задаёт срок хранения, а `PERSONAL_DATA_RETENTION_INTERVAL_HOURS` — расписание проверки. Обезличиваются только клиенты, у которых нет активных или обновлённых после контрольной даты заявок. Один запуск ограничен `PERSONAL_DATA_RETENTION_BATCH_SIZE`; перед каждым изменением пригодность повторно проверяется в транзакции.

Для первого наблюдательного запуска установите `PERSONAL_DATA_RETENTION_DRY_RUN=true`. API запишет структурированный отчёт `personal_data.retention_completed` с количеством подходящих записей, ничего не меняя. После проверки отчёта установите `false`. Автоматизацию можно аварийно остановить через `PERSONAL_DATA_RETENTION_ENABLED=false`.

## Ограничение CRM и Back Office

CRM требует отдельную CRM-сессию и 2FA. Back Office дополнительно требует роль администратора. Их контейнеры не имеют опубликованных портов, а ответы содержат `noindex`.

После 10 неверных 2FA-кодов подряд (по всем попыткам входа учётной записи за сутки) вход блокируется на 1, 2, 4… минут, максимум на час. Каждая блокировка пишет в лог API событие `auth.two_factor.account_locked` уровня `warn` и запись `AUTH_TWO_FACTOR_ACCOUNT_LOCKED` в журнал Back Office — это признак подбора кода при известном пароле: смените пароль сотрудника. Смена пароля или сброс 2FA администратором снимает блокировку.

Пароли: после 5 неверных паролей к одному логину за час вход по нему приостанавливается на 1, 2, 4… минуты, максимум на 15 минут, независимо от IP; для несуществующих логинов — так же, поэтому ответ не выдаёт, есть ли учётная запись. Во время паузы пароль не проверяется. Событие — `auth.login.account_locked` (`warn`) и `AUTH_LOGIN_ACCOUNT_LOCKED` в журнале. Хеши паролей хранятся в формате `scrypt$N$r$p$соль$хеш` (сейчас N=2^15, r=8, p=3). Старые хеши вида `соль:хеш` продолжают работать и переписываются в новый формат при следующем успешном входе, сброс паролей не нужен. Сколько учётных записей ещё не перешло:

```sql
SELECT count(*) FROM "User" WHERE "passwordHash" NOT LIKE 'scrypt$32768$8$3$%';
```

По решению владельца (D4, 2026-09-23) CRM и Back Office остаются доступными из интернета; дополнительное ограничение по IP выключено (`allow all;` в `deploy/nginx/access/internal.conf`). Чтобы включить его для офисного/VPN IP, замените `allow all;` на:

```nginx
allow 203.0.113.10/32;
allow 198.51.100.0/24;
deny all;
```

В Nginx смонтирован каталог `deploy/nginx/access`, а не отдельный файл, поэтому правка любым редактором видна после reload. Проверьте и перечитайте Nginx:

```bash
docker compose --env-file .env.production -f compose.production.yml exec nginx nginx -t
docker compose --env-file .env.production -f compose.production.yml exec nginx nginx -s reload
```

### Аварийное закрытие CRM и Back Office

Если есть подозрение на утечку пароля или сессии сотрудника:

1. Закройте CRM и Back Office для всех, кроме себя: в `deploy/nginx/access/internal.conf` замените `allow all;` на `allow <ваш IP>/32;` и `deny all;` (или только `deny all;`), затем выполните `nginx -t` и `nginx -s reload`, как показано выше. Публичный сайт, каталог и приём заявок продолжают работать.
2. В Back Office → «Пользователи» отзовите сессии затронутых сотрудников, смените им пароль и при необходимости сбросьте 2FA. Если доступ в Back Office закрыт и для вас, сначала добавьте свой IP в `allow`.
3. Проверьте журнал Back Office и логи API (`auth.login.account_locked`, `auth.two_factor.account_locked`).
4. Верните `allow all;` и перечитайте Nginx.

Если IP-ограничение включено и ваш адрес сменился, доступ восстанавливается так же: войдите на сервер по SSH, добавьте текущий IP в `allow` и перечитайте Nginx. SSH по ключу — единственный аварийный канал, поэтому не закрывайте его firewall-правилами по тому же списку IP.

### Периметр публичного API

На `api.<домен>` Nginx пропускает только то, что нужно браузеру публичного сайта и проверкам доступности:

- `GET`/`HEAD` `/health`, `/ready`, `/catalog/*`, `/site-media`, `/address/suggestions`, `/requests/challenge`;
- `POST` `/requests/cart`, `/requests/custom`, `/requests/wholesale`;
- `OPTIONS` на этих адресах (CORS preflight).

Всё остальное — `/auth/*`, `/customers/*`, `/backoffice/*`, CRM-операции с заявками, `/metrics` — снаружи отвечает `404` с телом `{"statusCode":404,"message":"Not Found"}`. CRM, Back Office и серверная часть сайта обращаются к API по `API_URL=http://api:4000` внутри Docker-сети. Тело запроса к публичному API ограничено 128 КБ: загрузка файлов идёт только через Back Office.

`/metrics` доступен только изнутри Docker-сети, например:

```bash
docker compose --env-file .env.production -f compose.production.yml exec api \
  node -e "fetch('http://127.0.0.1:4000/metrics').then(r=>r.text()).then(console.log)"
```

Новый публичный маршрут API нужно добавить в `deploy/nginx/production.conf` и в `deploy/scripts/test-nginx-perimeter.sh`. Этот скрипт запускает production-конфигурацию Nginx в Docker с заглушкой вместо приложений и проверяет allowlist и заголовки; он выполняется в CI. Smoke-тест после deploy дополнительно проверяет, что служебные адреса API снаружи отвечают 404.

Nginx не раскрывает версию (`server_tokens off`) и сам выставляет `Strict-Transport-Security`, `X-Content-Type-Options` и `X-Frame-Options: DENY` на все ответы, включая свои ошибки и редиректы; одноимённые заголовки приложений и `X-Powered-By` скрываются. Остальные заголовки (CSP, `Referrer-Policy`, `X-Robots-Tag`) задают приложения.

## Антиспам публичных форм

Заявки с сайта (корзина, изготовление, опт) проходят проверки в таком порядке (SEC-03, решение владельца D3 — ALTCHA):

1. скрытое поле-ловушка: заполненное — «квитанция» без записи в БД;
2. лимит по IP (`PUBLIC_REQUEST_RATE_LIMIT_*`, по умолчанию 10 в минуту);
3. повтор с тем же `Idempotency-Key` и теми же данными возвращает исходную квитанцию;
4. ALTCHA — proof-of-work без сторонних сервисов, cookie и отслеживания. Браузер получает подписанную задачу с `GET /requests/challenge` и решает её, пока посетитель заполняет форму (на компьютере около секунды, на слабом телефоне — несколько секунд). API проверяет подпись (`ALTCHA_HMAC_SECRET`), срок (`ALTCHA_EXPIRES_SECONDS`, 20 минут) и решение и принимает каждую задачу один раз. Без верного решения ничего не создаётся — ни клиента, ни согласия, ни записи в истории; ответ — `400` с кодом `CAPTCHA_*`, и сайт сам решает новую задачу и отправляет форму ещё раз;
5. бюджеты, которые не обойти сменой IP: не больше `PUBLIC_REQUEST_CONTACT_LIMIT_MAX` (5) заявок в час на один нормализованный телефон и на один email, и не больше `PUBLIC_REQUEST_GLOBAL_LIMIT_MAX` (200) в час на весь сайт. Бюджеты расходуются только заявками, прошедшими ALTCHA, поэтому бот без решения не может закрыть формы для клиентов. Ответ — `429` с кодом `PUBLIC_REQUEST_CONTACT_LIMITED` или `PUBLIC_REQUEST_BUDGET_EXHAUSTED`.

Сложность задается `ALTCHA_COST` (итераций PBKDF2 на попытку, 1000) и `ALTCHA_MAX_COUNTER` (число попыток — от половины до этого значения, 10 000). При массовом спаме поднимите их в `.env.production` и перезапустите API: вырастут время решения для посетителей и цена для бота. Смена `ALTCHA_HMAC_SECRET` делает недействительными выданные задачи — открытые формы решат новую сами.

Отклонённые заявки считаются в `/metrics` — `gidravlika_public_request_rejections_total{reason=...}` (`honeypot`, `ip_limit`, `captcha_missing`, `captcha_invalid`, `captcha_expired`, `captcha_replayed`, `phone_limit`, `email_limit`, `global_budget`). Первое срабатывание глобального бюджета в окне пишет в лог API `public_request.global_budget_exhausted` уровня `warn` — это признак атаки или всплеска: реальные клиенты в этот момент тоже получают отказ с просьбой позвонить. Лимит по контакту пишет `public_request.contact_limited` (`info`); сами телефоны и email в лог не попадают.

## Резервные копии

Контейнер `backup` раз в сутки, а `deploy.sh` — перед каждой миграцией выполняют `deploy/postgres/backup.sh`:

1. PostgreSQL custom archive `backups/gidravlika-<время>.dump` и его SHA-256;
2. снимок приватных оригиналов `backups/originals-<то же время>/` — неизменённые файлы являются жёсткими ссылками на предыдущий снимок и места не занимают, поэтому каждый архив БД имеет согласованный с ним набор оригиналов (первый снимок занимает столько же, сколько сами оригиналы);
3. восстановление архива во временную БД, проверка таблицы миграций и сверка «БД ↔ файлы»: каждый `Product.imageOriginalKey` и `SiteMedia.originalKey` должен быть в снимке. Недостающие файлы выводятся в лог (`missing original: …`, `WARNING: Originals check: …`), но backup не останавливают — они могли пропасть раньше; перезагрузите их через Back Office;
4. если задан `BACKUP_S3_URI` — внешняя копия (см. ниже);
5. удаление локальных архивов и снимков старше `BACKUP_RETENTION_DAYS` по времени в имени.

Любая ошибка — ненулевой код выхода. Одновременно выполняется только один backup; `deploy.sh` ждёт окончания ежедневного до 30 минут.

Внеплановый backup:

```bash
docker compose --env-file .env.production -f compose.production.yml exec backup /usr/local/bin/backup.sh
```

### Порядок deploy

`./deploy/scripts/deploy.sh` останавливается на первой ошибке:

1. проверка `.env.production` (обязательные значения, каталог `MEDIA_ORIGINALS_DIR`, `compose config`);
2. сборка образов — по одному, чтобы сборка рядом с работающим сайтом не исчерпала память сервера;
3. backup с проверкой восстановления и, если настроено, внешней копией — пропускается только для новой установки, где ещё нет таблицы миграций;
4. роли БД и миграции (`db-roles`, `migrate`);
5. запуск контейнеров;
6. smoke-тесты.

Если внешнее хранилище недоступно, а выпуск срочный, `./deploy/scripts/deploy.sh --skip-offsite` пропустит только отправку наружу; локальный backup и проверка восстановления остаются обязательными.

### Внешняя копия (off-site)

По решению владельца (D5, 2026-09-23) внешняя копия пока не настроена: `BACKUP_S3_URI` пуст, и при потере сервера пропадут и БД, и оригиналы. `deploy.sh` напоминает об этом предупреждением. Механизм готов и включается заполнением `.env.production`:

```dotenv
BACKUP_S3_URI=s3://gidravlika-backups/production
BACKUP_S3_ENDPOINT=https://s3.twcstorage.ru
BACKUP_S3_REGION=ru-central1
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
BACKUP_AGE_RECIPIENT=age1...
```

С этого момента каждый backup и каждый deploy требуют успешной отправки. Наружу уходят только зашифрованные [age](https://age-encryption.org) данные:

- `db/gidravlika-<время>.dump.age` и `.age.sha256` — архив БД;
- `originals/<ключ>.age` — каждый оригинал один раз (ключи неизменяемы; что уже отправлено, помнит `backups/.originals-offsite.manifest`, поэтому список бакета не читается). Сначала отправляются оригиналы, затем архив.

Ключ шифрования создаёт владелец на своём компьютере, не на сервере:

```bash
age-keygen -o gidravlika-backup.key
```

Файл `gidravlika-backup.key` храните в менеджере паролей и в офлайн-копии; на сервер попадает только строка `Public key: age1...` из его вывода (`BACKUP_AGE_RECIPIENT`). Без секретного ключа внешние копии не прочитать — ни злоумышленнику с ключом бакета или доступом к серверу, ни вам при его потере.

Требования к бакету (DATA-07):

- отдельный приватный бакет, не бакет публичных изображений;
- ключ `BACKUP_S3_*` с правом только на загрузку (`s3:PutObject`); чтение, листинг и удаление скрипту не нужны;
- lifecycle-правило: объекты с префиксом `db/` удаляются через `BACKUP_RETENTION_DAYS` дней. Так обезличивание ПДн по retention-политике доходит и до копий: обезличенные данные остаются в архивах не дольше этого срока. Префикс `originals/` (фото товаров, без ПДн) не истекает. Правило задаётся ключом администратора бакета, например:

```bash
aws s3api put-bucket-lifecycle-configuration --endpoint-url https://s3.twcstorage.ru \
  --bucket gidravlika-backups --lifecycle-configuration '{"Rules":[{"ID":"db-retention","Status":"Enabled","Filter":{"Prefix":"production/db/"},"Expiration":{"Days":14}}]}'
```

Поддержку lifecycle и ключей только на запись проверьте у провайдера до включения.

Восстановление из внешней копии (сервер потерян) выполняется на машине с секретным ключом:

```bash
aws s3 cp --endpoint-url https://s3.twcstorage.ru s3://gidravlika-backups/production/db/gidravlika-<время>.dump.age .
aws s3 cp --endpoint-url https://s3.twcstorage.ru s3://gidravlika-backups/production/db/gidravlika-<время>.dump.age.sha256 .
sha256sum -c gidravlika-<время>.dump.age.sha256
age --decrypt --identity gidravlika-backup.key --output gidravlika-<время>.dump gidravlika-<время>.dump.age
aws s3 cp --recursive --endpoint-url https://s3.twcstorage.ru s3://gidravlika-backups/production/originals/ originals-encrypted/
cd originals-encrypted && find . -name '*.age' | while IFS= read -r file; do
  mkdir -p "../originals/$(dirname "$file")"
  age --decrypt --identity ../gidravlika-backup.key --output "../originals/${file%.age}" "$file"
done
```

Затем положите `.dump` в `backups/` нового сервера, оригиналы — в `MEDIA_ORIGINALS_DIR` (владелец `1000:1000`) и выполните `restore-production.sh`. Для чтения нужен ключ бакета с правом `GetObject` — отдельный от ключа сервера.

### Восстановление

```bash
./deploy/scripts/restore-production.sh --confirm gidravlika-YYYYMMDDTHHMMSSZ.dump
```

Скрипт делает страховую копию текущего состояния (без отправки наружу), останавливает приложения, восстанавливает БД, копирует оригиналы из снимка с тем же временем в `MEDIA_ORIGINALS_DIR` (более новые файлы не удаляются — лишние файлы безвредны), выводит сверку «БД ↔ файлы», запускает `db-roles` и `migrate` (владение и права восстанавливаются) и приложения, затем smoke-тест. Для архивов, сделанных до появления снимков, восстанавливается только БД.

Проверка скриптов backup без production: `./deploy/scripts/test-backup.sh` (Docker; PostgreSQL и S3Mock вместо S3 поднимаются временно). Он же выполняется в CI.

## Оригиналы изображений

Обработанные изображения для сайта и каталога хранятся в публичном S3, а исходные файлы —
только в приватном каталоге `MEDIA_ORIGINALS_DIR` на сервере. Этот каталог смонтирован в API
контейнер как `/media/originals` и не должен быть доступен через Nginx.

После первого production-развёртывания перенесите локальные оригиналы на сервер. Замените
`deploy@server` на SSH-пользователя и адрес сервера:

```bash
ssh deploy@server 'sudo install -d -o 1000 -g 1000 -m 700 /var/lib/gidravlika-media/originals'
rsync -a --info=progress2 \
  apps/api/.local/media/originals/ \
  deploy@server:/var/lib/gidravlika-media/originals/
ssh deploy@server 'sudo chown -R 1000:1000 /var/lib/gidravlika-media/originals'
```

После переноса откройте Back Office → «Медиафайлы» и нажмите «Проверить» в блоке
«Синхронизация хранилищ»: он сверяет наличие приватных оригиналов и соответствующих WebP в S3
для фото сайта и каталога.

Можно переносить большие наборы оригиналов по SFTP напрямую в этот же приватный каталог на
сервере. Сохраняйте структуру и имена:

```text
/var/lib/gidravlika-media/originals/
  catalog/100001.jpg
  site/hero/main-1.png
  site/main-gallery/about-1.jpg
  site/gallery/gallery-1.jpg
```

После SFTP нажмите Back Office → «Медиафайлы» → «Синхронизировать с сервером», а затем
«Проверить». Синхронизация только связывает уже скопированные оригиналы с записями в базе;
она не отправляет их в публичное S3 и не заменяет готовые WebP. Для одного изображения допустим
один файл: например, нельзя одновременно оставлять `catalog/100001.jpg` и
`catalog/100001.png`. Имя файла каталога должно совпадать с артикулом с учётом регистра
(`ABC.jpg` и `abc.jpg` относятся к разным товарам). Файлы по артикулу связываются только с
товарами, у которых ещё нет оригинала на сервере: уже загруженный оригинал не заменяется.

Для небольших наборов можно использовать кнопку «Загрузить оригиналы фото сайта» в этом же
блоке Back Office. Можно выбрать любое количество файлов до 8 МБ каждый: браузер отправляет
их по одному и показывает прогресс, а при ошибке сообщает, сколько файлов уже обработано.
Имя сопоставляется с текущим WebP без учёта регистра и расширения. Для больших наборов и новых
единообразных имён удобнее SFTP и кнопка «Синхронизировать с сервером».

Кнопка «Загрузить оригиналы каталога» работает аналогично, но сопоставляет имя файла с
артикулом товара с учётом регистра: `100001.png` будет связано с товаром `100001`. Если имя
совпадает с артикулом только без учёта регистра, файл попадает в «Неоднозначно» и не
загружается.

Ключи новых файлов неизменяемы и не зависят от позиции или артикула:

- `site/hero/<uuid>.webp`, `site/main-gallery/<uuid>.webp`, `site/gallery/<uuid>.webp` — фото
  сайта; приватный оригинал лежит рядом с тем же `<uuid>` и своим расширением. Порядок фото
  хранится только в базе, поэтому перетаскивание не переименовывает объекты. Главное фото на
  сайте всегда одно: новая загрузка заменяет текущее.
- `catalog/<id товара>/<uuid>.webp` и приватный `catalog/<id товара>/<uuid>.jpg` — изображение
  товара. Каждая загрузка получает новый ключ, поэтому неудачная попытка не затрагивает
  опубликованное фото, а прежние файлы удаляются только после сохранения новой ссылки в базе.
  При удалении товара его WebP и оригинал тоже удаляются (см. «Очистка файлов» ниже).

Ранее загруженные ключи (`site/gallery/gallery-1.webp`, `catalog/100001.webp` и т. п.)
продолжают работать и заменяются новыми при следующей загрузке, замене или кадрировании.
Имена `main-1`, `about-N` и `gallery-N` используются только для SFTP-синхронизации оригиналов:
`N` — текущая позиция фото в разделе, а уже связанный оригинал синхронизация не заменяет.

Сайт показывает фото товаров и медиатеки через оптимизатор Next.js (`/_next/image`): телефон получает копию по ширине экрана (640–1920 px) в WebP, а не оригинал до 2400 px. Уменьшенные копии контейнер `web` делает при первом запросе и хранит на диске 30 дней (`images.minimumCacheTTL`); после deploy кеш создаётся заново. Адреса фото не содержат `?v=`: каждая версия лежит под своим ключом, поэтому новые объекты загружаются в S3 с `Cache-Control: public, max-age=31536000, immutable`. Объекты, загруженные раньше, остаются с `no-cache` — на сайт это не влияет, оптимизатор всё равно кеширует копии. Если оптимизатор не может получить фото (DNS, CDN), сайт один раз загружает оригинал напрямую — фото не пропадает.

Оптимизатор Next не берёт картинки с хостов, которые резолвятся в частные адреса. Если в локальной разработке прокси или VPN подменяет адрес CDN (например, `240.0.0.x`), фото на `localhost:3000` показываются без оптимизации; чтобы проверить оптимизацию, задайте `S3_ALLOW_LOCAL_IP=true` в `apps/web/.env.local` (действует только в разработке).

Публичный `GET /site-media` и список в Back Office читают только базу. Объекты в S3 без записи
в базе регистрируются лишь по кнопке «Синхронизировать с сервером» и добавляются скрытыми,
поэтому фото, удалённое из базы, само на сайт не возвращается.

Долгие операции с медиа укладываются в согласованные таймауты: API ждёт image-worker до 60 с,
BFF Back Office — до 120 с для фото товаров и синхронизации и до 60 с для фото сайта и импорта
одного оригинала (`apps/backoffice/src/lib/backoffice-proxy.ts`), Nginx для
`/api/backoffice/` — 125 с, браузер — на 10 с дольше BFF. При изменении одного из значений
проверьте остальные: тест `backoffice-proxy.test.mjs` сверяет BFF с `production.conf`. При
сохранении товара API повторно использует результат предпросмотра того же файла (хранится в
памяти процесса 30 минут), поэтому удаление фона обычно не запускается второй раз.

### Очистка файлов и сверка хранилищ

Удаление товара и замена его фото ставят прежние WebP и оригинал в очередь `StorageCleanup` в
той же транзакции, что и само изменение, и удаляют их сразу после commit. Если S3 или диск
недоступны, запись остаётся в очереди, а API повторяет удаление каждые
`STORAGE_CLEANUP_INTERVAL_MINUTES` минут (15 по умолчанию) с растущей паузой до 6 часов.
Файл, на который к этому моменту снова ссылается запись (старый общий ключ `catalog/<артикул>.webp`),
не удаляется. Пока файл стоит в очереди, синхронизация оригиналов и фото сайта его не
подхватывает. Посмотреть застрявшие удаления:

```bash
docker compose --env-file .env.production -f compose.production.yml exec postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT location, key, attempts, \"lastError\", \"nextAttemptAt\" FROM \"StorageCleanup\" ORDER BY \"createdAt\""'
```

Раз в сутки (`MEDIA_RECONCILE_INTERVAL_HOURS`, первый запуск через 10 минут после старта API)
сверка хранилищ сравнивает префиксы `catalog/`, `products/`, `site/` в S3 и
`MEDIA_ORIGINALS_DIR` с базой и пишет в лог API событие `media.storage_reconciled`:

- `orphaned` — файлы с ключами, которые генерирует сам API (`…/<uuid>.webp`, `…/<uuid>.png` и
  недописанные `*.part`), без ссылок в базе и старше `MEDIA_RECONCILE_GRACE_HOURS` (24 ч; более
  свежие могут принадлежать загрузке, которая ещё не сохранена). Только они ставятся в очередь
  удаления;
- `unmanaged` — несвязанные файлы со «старыми» именами (`catalog/100001.png`, `gallery-3.webp`).
  Их кладут по SFTP для кнопки синхронизации, поэтому сверка их не удаляет, только считает;
- `missing` — ссылки из базы на файлы, которых нет в хранилище (перезагрузите фото в Back Office).

Сверка включена в production, но по умолчанию только отчитывается (`MEDIA_RECONCILE_DRY_RUN=true`).
Перед тем как выключить dry-run, убедитесь, что этот бакет не использует другая база — например,
локальный стенд разработки: для production-сверки его файлы выглядят «сиротами». В `.env`
разработки сверка выключена (`MEDIA_RECONCILE_ENABLED=false`) по той же причине. После
восстановления более старого backup новые файлы, на которые восстановленная база не ссылается,
тоже станут `orphaned`; если их нужно сохранить, на время разбора включите `MEDIA_RECONCILE_DRY_RUN=true`.

Файлы, которые раньше были загружены только в S3, не имеют исходника в базе. Их нельзя
безопасно восстановить из WebP: загрузите настоящий исходный файл через Back Office и замените
изображение. После этого система будет хранить приватный оригинал и новый WebP автоматически.

Контейнер `backup` раз в сутки:

1. создаёт PostgreSQL custom archive;
2. проверяет структуру архива и SHA-256;
3. восстанавливает его во временную БД;
4. проверяет таблицу миграций;
5. удаляет временную БД;
6. хранит локальные архивы 14 дней;
7. при заданном `BACKUP_S3_URI` отправляет копию и checksum во внешнее S3-хранилище.

Локальные бэкапы находятся в каталоге `BACKUP_DIRECTORY`. Для защиты от отказа диска обязательно настройте `BACKUP_S3_URI` либо независимую синхронизацию на другой сервер. Срок хранения удалённых копий задайте lifecycle policy бакета.

Проверить состояние:

```bash
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 backup
docker compose --env-file .env.production -f compose.production.yml exec backup ls -lh /backups
```

Запустить внеплановый backup:

```bash
docker compose --env-file .env.production -f compose.production.yml exec backup /usr/local/bin/backup.sh
```

Проверить выбранный архив восстановлением во временную БД:

```bash
docker compose --env-file .env.production -f compose.production.yml exec backup \
  /usr/local/bin/verify-restore.sh /backups/gidravlika-YYYYMMDDTHHMMSSZ.dump
```

## Сервис удаления фона (image-worker)

Модель `u2net.onnx` скачивается при сборке образа и проверяется по SHA-256 (аргументы
`U2NET_URL` и `U2NET_SHA256` в `services/image-worker/Dockerfile`); при несовпадении сборка
останавливается. Поэтому контейнер стартует без доступа в интернет и без тома для модели.
После первого deploy с этой версией старый том можно удалить:

```bash
docker volume ls | grep rembg_models
docker volume rm <имя тома>
```

Контейнер работает от пользователя `10001`. Зависимости устанавливаются только из
`requirements.lock` с проверкой хешей; прямые зависимости перечислены в `requirements.in`, а
порядок обновления lock-файла описан в его заголовке. Изображения обрабатываются по одному
(`IMAGE_WORKER_CONCURRENCY`, по умолчанию `1`) в отдельном потоке, поэтому `/health` отвечает и
во время обработки. Изображения больше 25 Мп или 8000 px по стороне отклоняются с кодом 400.

Тесты worker запускаются внутри собранного образа:

```bash
docker build -t gidravlika25-image-worker:test services/image-worker
docker run --rm -v "$PWD/services/image-worker:/src" -w /src gidravlika25-image-worker:test \
  sh -c 'pip install --user -q -r requirements-dev.txt && python -m pytest -q -p no:cacheprovider'
```

В dev-окружении (`docker-compose.yml`) порты PostgreSQL, локального S3 и image-worker открыты только на
`127.0.0.1`. Чтобы изменения применились к уже запущенным контейнерам, пересоздайте их:
`docker compose up -d --build`.

## Аварийное восстановление production

Восстановление заменяет текущую базу. Скрипт сначала создаёт аварийную копию текущего состояния, затем останавливает приложения и принимает только имя файла из `/backups`:

```bash
./deploy/scripts/restore-production.sh --confirm gidravlika-YYYYMMDDTHHMMSSZ.dump
```

После восстановления автоматически запускаются контейнеры и smoke-тест. Если восстановление завершилось ошибкой, приложения остаются остановленными — изучите вывод до повторного запуска.

## Обновление и откат

Перед обновлением убедитесь, что CI зелёный, затем измените `IMAGE_TAG` и выполните `./deploy/scripts/deploy.sh` — backup с проверкой восстановления он делает сам до миграций.

Откат приложений на уже собранный тег:

```bash
./deploy/scripts/rollback.sh previous-tag
```

Откат не отменяет миграции БД. Миграции релиза должны быть обратно совместимыми с предыдущей версией приложения. Восстановление всей базы используйте только при инциденте и осознанной потере более новых данных.

При обновлении контейнеры останавливаются корректно. API по SIGTERM перестаёт принимать соединения, дожидается запросов в работе (до `SHUTDOWN_DRAIN_TIMEOUT_MS`, 50 с) и только потом закрывает соединения с БД и S3; Compose ждёт `stop_grace_period` (60 с для API и image-worker, 20 с для сайта, CRM и Back Office), прежде чем убить процесс. В логе API остановка видна как `application.shutdown_started` → `application.shutdown_completed`.

## Диагностика

API публикует три служебных endpoint:

- `/health` — процесс API запущен;
- `/ready` — API доступен и соединение с PostgreSQL работает;
- `/metrics` — Prometheus-метрики: ответы по классам, счётчик 5xx, гистограмма времени ответа (`gidravlika_http_request_duration_seconds`, без служебных запросов), обращения к DaData по исходу и отклонённые антиспамом заявки (см. «Антиспам публичных форм»). Снаружи закрыт;
- `/ops/status` — статус эксплуатации для монитора (см. ниже). Доступен через `api.<домен>` только с заголовком `Authorization: Bearer <OPS_STATUS_TOKEN>`.

Уровень структурированных логов задаётся через `LOG_LEVEL`: `debug`, `info`, `warn`, `error` или `fatal`. Для production по умолчанию используется `info`.

```bash
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=200 api
docker compose --env-file .env.production -f compose.production.yml logs --tail=200 nginx
./deploy/scripts/smoke-test.sh
```

Все контейнеры имеют отдельные CPU/RAM-лимиты. Локальные JSON-логи ротируются по `LOG_MAX_SIZE` и `LOG_MAX_FILES`; текущие значения и переопределения перечислены в `.env.production.example`.

Smoke-тест проверяет сайт, каталог, sitemap, readiness API, страницы входа CRM/Back Office, валидацию публичной заявки без записи в БД, выдачу ALTCHA-задачи и доступность изображения первого товара.

## Мониторинг и оповещения

Workflow `.github/workflows/production-monitor.yml` каждые 5 минут запускает с GitHub runner скрипт `deploy/scripts/production-monitor.sh` и проверяет:

- **доступность** `https://<домен>/`, `https://api.<домен>/ready` (ответ `"status":"ok"`), `https://crm.<домен>/login`, `https://bo.<домен>/login`;
- **TLS**: сертификаты всех пяти имён действуют ещё не меньше 14 дней (`TLS_MIN_DAYS`);
- **статус эксплуатации** `GET https://api.<домен>/ops/status`. Каждая проверка в нём — отдельное оповещение:

| Проверка | Сбой (`fail`) или предупреждение (`warn`) | Порог |
|---|---|---|
| `database` | PostgreSQL не отвечает | — |
| `storage` | S3 или каталог оригиналов недоступен | — |
| `http` | ответов 5xx за 15 минут не меньше порога (`fail`); p95 времени ответа выше порога при ≥ 20 запросах (`warn`) | `OPS_ALERT_SERVER_ERRORS=5`, `OPS_ALERT_P95_MS=2500` |
| `dadata` | суточный лимит исчерпан или DaData отвечает ошибками (`fail`); израсходовано ≥ 80 % лимита или ключ не задан (`warn`) | `DADATA_DAILY_LIMIT=9000` |
| `backup` | последний успешный backup старше порога или его нет | `OPS_BACKUP_MAX_AGE_HOURS=26` |
| `mediaCleanup` | есть файлы, которые не удаётся удалить после 3 попыток (`warn`) | — |

На каждую непрошедшую проверку открывается одна GitHub Issue `[Production alert] …` с текстом проблемы; когда проверка снова проходит, issue комментируется и закрывается автоматически. Запуск с проблемами завершается ошибкой. Возраст backup API берёт из таблицы `OperationHeartbeat`: контейнер `backup` пишет туда отметку только после того, как прошли все шаги, включая проверку восстановления и off-site копию.

Настройка (один раз):

1. Сгенерируйте токен и запишите его в `.env.production` как `OPS_STATUS_TOKEN` (без него API в production не запустится):

   ```bash
   openssl rand -base64 48
   ```

2. В GitHub → Settings → Secrets and variables → Actions добавьте secret `OPS_STATUS_TOKEN` с тем же значением. Без него монитор проверяет только доступность и TLS. Для другого домена задайте repository variable `MONITOR_DOMAIN`.
3. Включите уведомления о новых issues (Watch → Custom → Issues) для ответственных за эксплуатацию.
4. **Внешний uptime-сервис.** Расписание GitHub выполняется с задержками и отключается после 60 дней без активности в репозитории, поэтому дублируйте проверку доступности во внешнем сервисе (UptimeRobot, Better Stack, Яндекс Мониторинг и т. п.; аккаунт заводит владелец): четыре адреса выше с интервалом 1–5 минут, для `https://api.<домен>/ready` — ключевое слово `"status":"ok"`, для каждого хоста — проверка срока сертификата, уведомления в Telegram или на почту.

Проверить вручную с рабочей машины:

```bash
OPS_STATUS_TOKEN=<токен> ./deploy/scripts/production-monitor.sh
```

Что делать при оповещении:

- **«… недоступен» / «API readiness check failed»** — `docker compose … ps`, логи сервиса и Nginx; при недоступной БД — логи `postgres`.
- **«TLS-сертификат … скоро истекает»** — логи `certbot-renew`. Nginx перечитывает сертификаты сам раз в 6 часов; после ручного продления — `docker compose --env-file .env.production -f compose.production.yml exec nginx nginx -s reload`.
- **`database`, `storage`** — доступность PostgreSQL, ключи и endpoint S3, смонтирован ли `MEDIA_ORIGINALS_DIR`.
- **`http`** — логи API (`http.request.completed` со `statusCode` 5xx, `application.error` с тем же `requestId`).
- **`dadata`** — при исчерпании подсказки адреса отключаются до полуночи по Москве (форма позволяет ввести адрес вручную); лимит — `DADATA_DAILY_LIMIT`, не выше квоты тарифа. В логе API: `address.dadata_budget_warning` при 80 %, `address.dadata_budget_exhausted` при исчерпании. Лимит общий для всех копий API (хранится в БД).
- **`backup`** — `docker compose … logs --tail=200 backup`; строка `WARNING: could not record the backup heartbeat` означает, что backup сделан, но отметку записать не удалось.
- **`mediaCleanup`** — список застрявших удалений: см. «Очистка файлов и сверка хранилищ».
- **«Статус эксплуатации недоступен»** — API не отвечает на `/ops/status` или токен в GitHub не совпадает с `.env.production` (ответ 401).
