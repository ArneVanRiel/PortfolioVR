# 📈 PortfolioVR - Geavanceerd Financieel Analyseplatform

**PortfolioVR** is een data-gedreven, full-stack webapplicatie voor het beheren van aandelenportfolio's, het uitvoeren van complexe fundamentele (DCF) en technische (MACD) analyses, en het monitoren van de beurs. 

Deze applicatie is ontworpen om grote datasets (waaronder SEC-filings en live beursdata) te parsen en te visualiseren in een intuïtief, responsief dashboard, gebouwd met React en Node.js.

---

## 🔗 Live Demo
**URL:** [https://portfoliovr.vercel.app](https://portfoliovr.vercel.app) *(Pas deze link aan naar jouw echte Vercel URL)*

Om de applicatie veilig te bekijken zonder data aan te passen, is er een speciaal demo-account beschikbaar:
- **Gebruikersnaam:** `demo`
- **Wachtwoord:** `Demo1234!`
- **OTP (Verificatiecode):** `000000`

---

## 🚀 Belangrijkste Features

- **Geautomatiseerde Data Pijplijnen (ETL):** Haalt automatisch financiële gegevens op via externe REST API's (waaronder de Amerikaanse **SEC EDGAR database** en **Profit.com**), transformeert ruwe JSON-data naar gestructureerde tabellen, en slaat deze op.
- **Complexe Wiskundige Berekeningen:** Berekent server-side technische indicatoren (zoals Exponential Moving Averages en MACD) en fundamentele waarderingen (Discounted Cash Flow, Graham Fair Value).
- **Portfolio Rendement & XIRR:** Analyseert de transactiehistorie en berekent dynamisch de Time-Weighted en Money-Weighted Return (XIRR) over instelbare periodes.
- **Bulk Transactie Import:** Ondersteunt het inladen van ruwe Excel/CSV export-bestanden van externe brokers (zoals DeGiro en eToro). Het systeem herkent en voorkomt dubbele boekingen en berekent direct de Belgische Beurstaks (TOB).
- **Role-Based Access Control (RBAC) & Security:** Beveiligd met JSON Web Tokens (JWT). Maakt gebruik van best practices rond beveiliging en afgeschermde backend routes (Middleware).

---

## 🛠️ Tech Stack & Architectuur

### Frontend (Client-side)
- **Framework:** React.js (Component-based architecture)
- **Styling:** Tailwind CSS voor een modern, volledig responsief design.
- **Datavisualisatie:** Chart.js (react-chartjs-2) voor interactieve lijn-, bar- en donutgrafieken.
- **Hosting:** Vercel (CI/CD)

### Backend (Server-side)
- **Runtime/Framework:** Node.js met Express.js
- **Architectuur:** MVC-patroon (Models, Views, Controllers) voor schone code-separatie.
- **Security:** JWT (JSON Web Tokens), Bcrypt voor wachtwoord hashing, CORS-configuratie.
- **Hosting:** Render.com

### Database
- **Database Engine:** Microsoft SQL Server (Azure SQL)
- **Taal:** T-SQL. Maakt uitgebreid gebruik van geavanceerde queries (zoals `MERGE` statements voor upserts en `Window Functions` voor het groeperen en ordenen van historische tijdreeksen).

---

## ⚙️ Lokale Installatie

1. Clone deze repository: `git clone https://github.com/ArneVanRiel/PortfolioVR.git`
2. Navigeer naar de backend en installeer de packages: `cd backend && npm install`
3. Start de backend server: `npm start` (draait op poort 5000)
4. Open een nieuwe terminal, navigeer naar de frontend: `cd frontend && npm install`
5. Start de React applicatie: `npm start` (draait op poort 3000)

*(Let op: Om deze applicatie lokaal te draaien is een `.env` bestand vereist met de juiste database credentials en API keys. Deze worden om veiligheidsredenen niet gedeeld op GitHub).*