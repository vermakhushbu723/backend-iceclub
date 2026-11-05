# ICECLUB Backend

One API for the Dealer App, Rider App, Customer App and Admin Panel. Node.js, Express and MongoDB.

## Run it

```
npm install
cp .env.example .env     # then fill it in
npm run seed             # sample data, only into an empty database
npm run dev              # http://127.0.0.1:4000/api
```

| Command | What it does |
| --- | --- |
| `npm start` | Starts the server |
| `npm run dev` | Starts the server and restarts it on changes |
| `npm run seed` | Adds sample data. `-- --reset` replaces what is there |
| `npm run test:api` | Tests every API against a real server and the `iceclub_test` database, which it deletes afterwards |
| `npm run test:server` | Starts a server on `iceclub_test` for the apps' tests |
| `npm run lint` | Checks the code |

## Folder structure

```
src/
  server.js              starts the server and the hourly jobs
  app.js                 Express setup, connects the modules
  config/                settings from .env, database connection
  middleware/            login check, error handling, request safety
  models/                one file for each MongoDB collection
  utils/                 small helpers
  services/              business rules used by more than one app
    orders/              placing and moving orders
  modules/               one folder for each app
    auth/                login for all apps
    dealer/              Dealer App   /api/dealer
    rider/               Rider App    /api/rider
    customer/            Customer App /api/customer
    admin/               Admin Panel  /api/admin
      actions/           one file for each area of the panel
    shared/              notifications and tickets, used by all three apps
    files/               photo and document uploads
    system/              health check and the daily job
  seed/                  sample data
scripts/                 API tests
```

Inside `dealer/`, `rider/` and `customer/`:

- `<app>.routes.js` lists the app's features.
- `routes/` has one file per feature, such as `order.routes.js`.
- `<app>.views.js` shapes data the way that app expects it.

## Connecting the clients

**Admin Panel:** set `VITE_API_URL` to `https://your-server/api` when building. On Vercel this goes in the project's environment variables. Add the panel's address to `CORS_ORIGINS` here.

**Apps:** pass the address when building:

```
flutter build apk --release --dart-define=API_URL=https://your-server/api --dart-define=SHOW_DEMO_HINT=false
```

Without it, an app uses `http://127.0.0.1:4000/api`. To test on a phone over USB, run `adb reverse tcp:4000 tcp:4000`.

To run the apps' own tests, which need no server:

```
flutter test --dart-define=USE_FAKE_BACKEND=true
```

To run an app's real code against a server, start `npm run test:server` and then:

```
flutter test test/api_contract_test.dart --run-skipped --dart-define=API_URL=http://127.0.0.1:4100/api
```

## Sample logins

| Who | Login | Password |
| --- | --- | --- |
| Admin | admin@iceclub.online | Admin@1234 |
| Dealer | 9876543210 | Demo@1234 |
| Rider | 9000000001 | Rider@1234 |
| Customer | 9876500000 | Customer@1234 |

The OTP is `123456` while `ALLOW_DEMO_OTP=true`.

## Before real customers use this

- **Replace the sample data:** real prices, products, factories, and new passwords for every sample login.
- **SMS:** connect a provider in `src/services/otp.service.js`, then set `ALLOW_DEMO_OTP=false`.
- **Payments:** connect a gateway, then set `ALLOW_DEMO_PAYMENTS=false`. While this is `true`, online payments and wallet top-ups count as paid without any money moving. While it is `false`, they are refused.
- **Push notifications:** notifications appear inside the apps. Alerts on a locked phone need a push service.
- **Maps:** the apps and panel use public OpenStreetMap tiles, which aren't meant for production apps.
- **Database:** use a database user that can reach only the `iceclub` database.

## Hosting

The server needs to run all the time, because it places standing orders and subscriptions every hour. Render, Railway or a VPS suit this. On a host that only runs per request, such as Vercel, call `POST /api/cron/daily` on a schedule with the header `x-cron-secret`.

In Atlas, under Network Access, allow the server's IP address.
