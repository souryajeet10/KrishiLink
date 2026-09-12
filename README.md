# 🌾 KrishiLink

### Empowering Farmers with Better Market Access, Better Information & Better Decisions

**KrishiLink** is a farmer-first digital agriculture platform designed to simplify the process of **finding market prices, discovering buyers, comparing markets, and accessing agricultural information** through one easy-to-use interface.

Built for the **Smart India Hackathon 2026** problem statement **PS 26132**.

## 🚀 Live Demo

> **[https://krishilink-production.up.railway.app/app.html](https://krishilink-production.up.railway.app/app.html)**

Try the live demo with these test accounts:
| Role | Phone | Password |
|------|-------|----------|
| 👨‍🌾 Farmer | `9876543210` | `farmer123` |
| 🏪 Buyer | `9123456789` | `buyer123` |
| ⚙️ Admin | `9000000001` | `admin123` |

---

## 🚜 The Problem

Farmers often face challenges such as:

* 📉 Lack of clear and timely market-price information
* 🤝 Difficulty finding suitable buyers
* 🏪 Dependence on intermediaries and limited market visibility
* 📱 Multiple disconnected agricultural platforms
* 🗣️ Complex interfaces and language barriers
* 📊 Difficulty converting available agricultural data into useful decisions

The problem is not simply the **absence of information** — it is the **fragmentation of information**.

---

## 💡 Our Solution

KrishiLink brings essential agricultural information into **one simple, farmer-friendly platform**.

### With KrishiLink, farmers can:

| Feature                        | Description                                            |
| ------------------------------ | ------------------------------------------------------ |
| 💰 **Market Prices**           | View relevant agricultural commodity prices            |
| 🤝 **Find Buyers**             | Discover potential buyers for produce                  |
| 📍 **Market Discovery**        | Explore nearby and relevant markets                    |
| 📊 **Price Comparison**        | Compare prices across markets                          |
| 🎙️ **Voice-First UI**         | Interact using voice instead of relying only on typing |
| 🌐 **Multilingual Support**    | Make information easier to understand                  |
| 🏛️ **Government Information** | Access relevant agricultural schemes and resources     |
| 🔎 **Smart Search**            | Find agricultural information quickly                  |

---

## ⭐ What Makes KrishiLink Different?

KrishiLink is **not another standalone marketplace**.

Existing agricultural platforms such as **e-NAM, MSAMB and Agmarknet** provide valuable data and services, but farmers may still need to navigate multiple systems.

KrishiLink focuses on the **farmer's journey**:

```text
          FARMER
             │
             ▼
     What should I sell?
             │
             ▼
       What is the price?
             │
             ▼
       Who can buy it?
             │
             ▼
      Which market is better?
             │
             ▼
       ┌─────────────┐
       │  KRISHILINK  │
       └─────────────┘
             │
             ▼
     BETTER SELLING DECISION
```

### Our approach

**Existing ecosystem → KrishiLink → Simple farmer experience**

Instead of replacing existing agricultural infrastructure, KrishiLink aims to make useful information **more accessible and actionable for farmers**.

---

## 🏗️ Technology Stack

### Frontend

* **Flutter**
* Dart
* Responsive farmer-friendly UI
* Voice interaction

### Backend

* **REST API**
* Python / backend services
* Authentication & business logic

### Database

* **PostgreSQL**
* Structured agricultural and marketplace data

### Data & APIs

KrishiLink is designed to integrate relevant agricultural information from sources such as:

* e-NAM
* MSAMB
* Agmarknet
* Government agricultural datasets
* Data.gov.in
* Other relevant agricultural APIs

---

## 🔄 System Flow

```text
┌─────────────────────┐
│       FARMER        │
│   Mobile Application│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Flutter Frontend  │
│                     │
│ Price | Buyer |     │
│ Market | Voice      │
└──────────┬──────────┘
           │
           │ REST API
           ▼
┌─────────────────────┐
│       Backend       │
│ Authentication      │
│ Business Logic      │
│ Data Processing     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     PostgreSQL      │
│                     │
│ Farmers             │
│ Products            │
│ Markets             │
│ Buyers              │
│ Price Data          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ External Data APIs  │
│                     │
│ e-NAM | MSAMB       │
│ Agmarknet | Govt.   │
└─────────────────────┘
```

---

## 🎨 Design Philosophy

KrishiLink follows a **farmer-first UX approach**.

### Principles

* 🟢 **Simple** — minimal steps to complete a task
* 🎙️ **Voice-first** — reduce dependency on typing
* 🌐 **Accessible** — designed for multilingual users
* 👆 **Touch-friendly** — large buttons and clear actions
* 📱 **Mobile-first** — optimized for smartphones
* 🧑‍🌾 **Familiar** — agricultural terminology and recognizable icons

---

## 📱 Core Screens

The application includes:

1. **Farmer Home**
2. **Market Prices**
3. **Commodity Search**
4. **Buyer Discovery**
5. **Market Comparison**
6. **Nearby Markets**
7. **Voice Assistant**
8. **Government Schemes**
9. **Farmer Profile**
10. **Marketplace**

---

## 📂 Project Structure

```text
KrishiLink/
│
├── frontend/
│   ├── lib/
│   │   ├── screens/
│   │   ├── widgets/
│   │   ├── services/
│   │   ├── models/
│   │   └── main.dart
│   └── pubspec.yaml
│
├── backend/
│   ├── routes/
│   ├── models/
│   ├── services/
│   ├── controllers/
│   └── main.py
│
├── database/
│   ├── schema/
│   └── seed/
│
├── docs/
│   ├── architecture/
│   └── api/
│
├── assets/
│   ├── images/
│   └── icons/
│
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

Make sure you have installed:

* Flutter SDK
* Dart SDK
* Python 3.x
* PostgreSQL
* Git

### Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/KrishiLink.git
cd KrishiLink
```

### Frontend

```bash
cd frontend
flutter pub get
flutter run
```

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

### Database

Create a PostgreSQL database and configure the required environment variables.

Example:

```env
DATABASE_URL=your_postgresql_connection_string
API_BASE_URL=your_backend_url
```

---

## 🔐 Environment Variables

Do not commit API keys, passwords, tokens, or other secrets.

Create a `.env` file locally:

```env
DATABASE_URL=
API_KEY=
API_BASE_URL=
```

Add `.env` to `.gitignore`.

---

## 🧪 Project Status

**Current Stage:** MVP / Prototype

The current version focuses on demonstrating the core KrishiLink experience and validating the farmer-first workflow.

### Roadmap

* [ ] Production-grade authentication
* [ ] Real-time market-price integration
* [ ] Buyer verification
* [ ] Advanced farmer recommendations
* [ ] More regional languages
* [ ] Offline/low-connectivity support
* [ ] Location-based market discovery
* [ ] Secure transaction workflow
* [x] Production deployment — **Live on Railway** 🚀

---

## 🏆 Smart India Hackathon 2026

**Problem Statement:** PS 26132

**Team:** Team Astra X

**Project:** KrishiLink

KrishiLink aims to bridge the gap between **agricultural data and practical farmer decisions** by creating a simple, accessible and farmer-first digital experience.

---

## 👥 Team

### Team Astra X

Building technology for a more connected agricultural ecosystem. 🌱

---

## 📜 License

This project is currently developed as part of **Smart India Hackathon 2026**.

Add an appropriate open-source license before public production release.

---

<p align="center">

### 🌾 KrishiLink

**From Information → To Action → To Better Decisions**

</p>
.

