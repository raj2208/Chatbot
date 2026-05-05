# Elanco — Engineering & Technology

## The Technology Team

The technology function at Elanco is led by **Sameer Khanna (CTO)** and is organised into four departments:

| Department | Head | Size | Location |
|-----------|------|------|----------|
| Platform Engineering | Rohan Pillai | 28 engineers | Bengaluru |
| Data & AI | Dr. Ananya Krishnan | 22 engineers | Hyderabad |
| Product Engineering | Siddharth Verma | 35 engineers | Bengaluru |
| IT & Security | Meera Joshi | 15 engineers | Bengaluru |

Total engineering headcount: ~100 across all departments.

---

## Technology Stack

### Cloud & Infrastructure
- **Primary cloud:** Google Cloud Platform (GCP)
- **Secondary / DR:** AWS (Mumbai region)
- **Infrastructure-as-Code:** Terraform (all infra managed via Terraform Cloud)
- **Containerisation:** Docker + Kubernetes (GKE clusters)
- **CI/CD:** GitHub Actions for application pipelines; ArgoCD for GitOps deployments

### Backend Services
- **Primary language:** Go (all new microservices since 2022)
- **Legacy services:** Python (Flask-based; being migrated)
- **API style:** REST for external-facing APIs; gRPC for internal service communication
- **Message queue:** Google Cloud Pub/Sub
- **Databases:** PostgreSQL (primary), Redis (caching and session), BigQuery (analytics)

### Frontend
- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Component library:** shadcn/ui
- **State management:** Zustand for global state; React Query for server state

### Data & AI Platform
- **Data warehouse:** BigQuery
- **Orchestration:** Apache Airflow (Cloud Composer)
- **ML platform:** Vertex AI (training and serving)
- **Feature store:** Feast (open source, self-hosted on GKE)
- **LLM use cases:** Gemini API (Google) for internal tooling; VetCare Analytics platform uses RAG over veterinary literature

### Monitoring & Observability
- **Metrics:** Prometheus + Grafana
- **Logs:** Cloud Logging + custom log router to BigQuery
- **Traces:** OpenTelemetry → Cloud Trace
- **Alerting:** PagerDuty (P0/P1), Slack (P2/P3)
- **Error tracking:** Sentry

### Security
- **Identity:** Google Workspace (SSO), Okta for third-party app access
- **Secrets management:** GCP Secret Manager
- **Vulnerability scanning:** Snyk (dependencies), Trivy (container images)
- **Compliance:** SOC 2 Type II (in progress, expected certification Q1 2025)

---

## Engineering Practices

### Development Workflow
1. All work tracked in Linear (engineering) and Jira (cross-functional projects)
2. GitHub for source control; branch protection rules enforced on `main`
3. PRs require: 2 approvals, passing CI, and Snyk scan with no critical vulnerabilities
4. Code review SLA: 24 hours for review, 48 hours for merge
5. Sprint length: 2 weeks; planning on Monday, retrospective on Friday of Week 2

### Deployment
- Deployments to production happen **every Wednesday and Friday** (release windows)
- Hotfixes can deploy anytime with CTO or department head approval
- Feature flags managed via LaunchDarkly; all new features ship behind a flag
- Zero-downtime deployments via Kubernetes rolling updates

### On-Call
- Platform Engineering and Product Engineering share on-call rotation
- Primary on-call: 1 week per ~8 engineers on rotation
- P0 response SLA: 15 minutes; P1: 1 hour; P2: 4 hours
- Runbooks maintained in Notion; linked in every PagerDuty alert

### Testing Standards
- Unit test coverage minimum: 80% (enforced in CI)
- Integration tests run on every PR against a staging database
- Load testing via k6 before every major release
- QA environment mirrors production architecture 1:1

---

## Key Internal Systems

### VetConnect Portal
Web platform for veterinary clinics to order Elanco products, access clinical trial data, and download product certificates. Built on Next.js + Go microservices. 14,000 registered clinics as of 2024.

### AgroField App
Mobile app (React Native) used by field sales representatives to record farm visits, log vaccine administration, and sync inventory data. Integrates with the central PostgreSQL inventory system via a REST API.

### ElancoIQ (Internal Analytics)
Internal BI platform built on BigQuery + Looker Studio. Used by sales, finance, and supply chain teams. Updated nightly via Airflow pipelines.

### VetCare Analytics (Acquired 2021)
AI platform that analyses veterinary case data to surface treatment insights. Currently being integrated into VetConnect Portal. Uses RAG (Retrieval-Augmented Generation) over a corpus of 2.3 million veterinary case records and 40,000 research papers.

---

## Hiring and Growth

The engineering team grew from 42 to 100 between 2022 and 2024. Current open roles (as of Q4 2024):
- Senior Backend Engineer (Go) — Platform Engineering
- ML Engineer — Data & AI
- DevOps Engineer — Platform Engineering
- Frontend Engineer (Next.js) — Product Engineering

Elanco sponsors engineers for GCP Professional certifications and covers 100% of course costs for any relevant technical certification.
