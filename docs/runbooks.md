# Что делать, если…

Команды выполняются на сервере в `/srv/gidravlika25`. Для краткости:

```bash
dc() { docker compose --env-file .env.production -f compose.production.yml "$@"; }
```

Уже описанные процедуры не повторяются здесь — ссылки ведут на них.

| Ситуация | Куда смотреть |
|---|---|
| Обновить приложение | [Развертывание.md](../Развертывание.md#обновить-приложение) |
| Новая версия работает плохо — откатить | [Развертывание.md](../Развертывание.md#откатить-версию-приложения) |
| Восстановить базу из бэкапа | [Развертывание.md](../Развертывание.md#восстановить-базу-из-бэкапа), подробнее — [deploy/README.md, «Аварийное восстановление production»](../deploy/README.md#аварийное-восстановление-production) |
| Сделать бэкап вручную | [Развертывание.md](../Развертывание.md#сделать-внеплановый-бэкап) |
| Подозрение, что украден пароль или сессия сотрудника | [deploy/README.md, «Аварийное закрытие CRM и Back Office»](../deploy/README.md#аварийное-закрытие-crm-и-back-office) |
| Пришла GitHub Issue `[Production alert] …` | [deploy/README.md, «Мониторинг и оповещения»](../deploy/README.md#мониторинг-и-оповещения) — в issue названа непрошедшая проверка |
| Сменить пароль или ключ | [secrets.md](secrets.md) |

## Сайт не открывается или отвечает 502

1. `dc ps` — все ли контейнеры `running`/`healthy`.
2. Логи того, что упало: `dc logs --tail=200 web` (или `api`, `nginx`).
3. `./deploy/scripts/smoke-test.sh` — покажет, какая часть не работает.
4. Если контейнер не стартует после правки `.env.production` — ошибка в переменных, текст называет переменную; для `NEXT_PUBLIC_*` нужен полный `./deploy/scripts/deploy.sh`.
5. Если сломало обновление — откат (ссылка выше).

## Не отвечает база данных

Признаки: `/ready` API отвечает 503, alert `database`. Проверьте `dc logs --tail=200 postgres` и свободное место: `df -h` (переполненный диск — самая частая причина). После освобождения места контейнеры поднимутся сами. Восстановление из бэкапа — только если данные повреждены: оно заменяет базу целиком.

## Недоступно хранилище фото (S3)

Сайт продолжает работать и принимать заявки, но фото каталога и сайта не грузятся; в Back Office не загружаются новые фото. Alert `storage`. Проверьте статус провайдера и ключи S3 (`S3_*` в `.env.production`). После восстановления ничего делать не нужно; очередь удаления старых файлов догонит сама.

## Не работают подсказки адреса (DaData)

Посетитель вводит адрес вручную — заявка всё равно уходит. Alert `dadata`: исчерпан суточный лимит (`DADATA_DAILY_LIMIT`), отозван ключ или DaData недоступна. Лимит сбрасывается в полночь по Москве.

## Утечка персональных данных

1. Остановите источник: закройте CRM и Back Office (ссылка выше), смените затронутые секреты ([secrets.md](secrets.md)), отзовите сессии.
2. Сохраните логи API и журнал Back Office за период инцидента.
3. По 152-ФЗ оператор уведомляет Роскомнадзор об инциденте с персональными данными в течение 24 часов, а о результатах расследования — в течение 72 часов. Проверьте актуальные требования и порядок уведомления перед отправкой.

## Единственный администратор потерял доступ

Если есть второй администратор — он делает то же через Back Office → «Пользователи». Блокировка из-за неверных паролей или кодов снимается сама (не больше 15 минут и часа). Если ждать нельзя или потерян и телефон, и резервные коды, а другого администратора нет:

1. **Сбросить 2FA и блокировки** (то же, что кнопка «Сбросить 2FA»; при следующем входе администратор заново подключит приложение):

   ```bash
   dc exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
   \set login 'admin'
   BEGIN;
   UPDATE "User"
      SET "twoFactorSecret" = NULL, "twoFactorEnabled" = false,
          "twoFactorEnabledAt" = NULL, "lastTotpCounter" = NULL, "isActive" = true
    WHERE login = :'login';
   DELETE FROM "AuthSession" WHERE "userId" IN (SELECT id FROM "User" WHERE login = :'login');
   DELETE FROM "AuthRecoveryCode" WHERE "userId" IN (SELECT id FROM "User" WHERE login = :'login');
   DELETE FROM "AuthTwoFactorChallenge" WHERE "userId" IN (SELECT id FROM "User" WHERE login = :'login');
   DELETE FROM "LoginAttempt"
    WHERE key IN (SELECT encode(sha256(convert_to('two-factor-account:' || id, 'UTF8')), 'hex')
                    FROM "User" WHERE login = :'login')
       OR key = encode(sha256(convert_to('login-account:' || :'login', 'UTF8')), 'hex');
   COMMIT;
   SQL
   ```

   Замените `admin` в первой строке на логин администратора.

2. **Если забыт и пароль** — получите хеш нового пароля (пароль вводится без отображения и не попадает в историю команд):

   ```bash
   read -rs NEW_PASSWORD
   printf '%s' "$NEW_PASSWORD" | dc exec -T api node -e \
     "require('/workspace/apps/api/dist/src/auth/password-hash.js').hashPassword(require('fs').readFileSync(0,'utf8')).then(console.log)"
   unset NEW_PASSWORD
   ```

   и запишите его (хеш начинается с `scrypt$`):

   ```bash
   dc exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
   UPDATE "User" SET "passwordHash" = 'ВСТАВЬТЕ_ХЕШ' WHERE login = 'admin';
   SQL
   ```

3. Войдите в Back Office и сразу проверьте журнал действий: не было ли чужих входов.

Если в базе вообще не осталось пользователей, первый администратор создаётся заново через bootstrap с `BOOTSTRAP_SECRET` — [Развертывание.md](../Развертывание.md).
