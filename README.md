# 📈 PortfolioVR - Geavanceerd Financieel Analyseplatform

**PortfolioVR** is een data-gedreven, full-stack webapplicatie voor het beheren van aandelenportfolio's, het uitvoeren van complexe fundamentele (DCF) en technische (MACD) analyses, en het monitoren van de beurs. 

Deze applicatie is ontworpen om grote datasets (waaronder SEC-filings en live beursdata) te parsen en te visualiseren in een intuïtief, responsief dashboard, gebouwd met React en Node.js.

---

## 🔗 Live Demo
**URL:** [https://portfolio-vr-ten.vercel.app/](https://portfolio-vr-ten.vercel.app/)

Om de applicatie veilig te bekijken zonder data aan te passen, is er een speciaal demo-account beschikbaar:
- **Gebruikersnaam:** `op aanvraag`
- **Wachtwoord:** `op aanvraag`
- **OTP (Verificatiecode):** `xxxxxx`

---

## 🚀 Belangrijkste Features

- **Geautomatiseerde Data Pijplijnen (ETL):** Haalt automatisch financiële gegevens op via externe REST API's (waaronder de Amerikaanse **SEC EDGAR database** en **Profit.com**), transformeert ruwe JSON-data naar gestructureerde tabellen, en slaat deze op.
- **Complexe Wiskundige Berekeningen:** Berekent server-side technische indicatoren (zoals Exponential Moving Averages en MACD) en fundamentele waarderingen (Discounted Cash Flow).
- **Portfolio Rendement & XIRR:** Analyseert de transactiehistorie en berekent dynamisch de Time-Weighted en Money-Weighted Return (XIRR) over instelbare periodes.
- **Bulk Transactie Import:** Ondersteunt het inladen van ruwe Excel/CSV export-bestanden van externe brokers (zoals DeGiro en eToro). Het systeem herkent en voorkomt dubbele boekingen en berekent direct de Belgische Beurstaks (TOB).
- **Role-Based Access Control (RBAC) & Security:** Beveiligd met JSON Web Tokens (JWT). Maakt gebruik van best practices rond beveiliging en afgeschermde backend routes (Middleware).

---

## 🛠️ Tech Stack & Architectuur

### Frontend (Client-side)
- **Framework:** React.js (Component-based architecture)
- **Styling:** Tailwind CSS.
- **Datavisualisatie:** Chart.js (react-chartjs-2) voor interactieve lijn-, bar- en donutgrafieken.
- **Hosting:** Vercel (CI/CD)

### Backend (Server-side)
- **Runtime/Framework:** Node.js met Express.js
- **Security:** JWT (JSON Web Tokens), Bcrypt voor wachtwoord hashing, CORS-configuratie.
- **Hosting:** Render.com

### Database
- **Database Engine:** Microsoft SQL Server (Azure SQL)

---
