# OGB Tool — OG Broking Placement Tool

## Structure

```
ogb-tool/
├── backend/           ← Railway (Python/Flask + PostgreSQL)
│   ├── app.py
│   ├── requirements.txt
│   ├── Procfile
│   └── users_seed.sql
├── frontend/          ← Netlify (static HTML/CSS/JS)
│   ├── index.html
│   ├── css/
│   │   └── app.css
│   └── js/
│       ├── main.js
│       ├── projectcargo.js
│       ├── seeds.js
│       ├── compliance.js
│       ├── dataexport.js
│       ├── autocompliance.js
│       ├── legalverify.js
│       ├── autotick.js
│       ├── extensions.js
│       └── patches.js
└── README.md
```

## Deploy

### Backend (Railway)
- Root directory: `backend/`
- Start command: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120`
- Required env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ADMIN_TOKEN`, `FRONTEND_ORIGIN`
- Optional: `ANTHROPIC_MODEL`, `APP_BASE_URL`, `MAX_UPLOAD_MB`
- Run `users_seed.sql` once after first deploy

### Frontend (Netlify)
- Publish directory: `frontend/`
- No build command needed
- Connect repo → set publish directory to `frontend` → deploy
