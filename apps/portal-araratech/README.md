---

# Sample Template - TypeScript

## Overview

The Sample Template is a scalable and modular starter template for building TypeScript-based Node.js applications. It is designed with best practices in mind, offering a clean architecture, dependency injection, and out-of-the-box support for Docker and unit testing.

## Features

- **TypeScript**: Strongly typed code for better developer experience.
- **Modular Architecture**: Clean separation of concerns.
- **Docker Support**: Pre-configured for containerization.
- **Testing Ready**: Integrated with testing frameworks.
- **Environment Configurations**: `.env` support for secure configuration management.

---

## Prerequisites

Before you begin, ensure your development machine meets these prerequisites:

1. **Node.js and npm**: Install Node.js and npm. Recommended version: Node 22+.
   - **Preferred Method (Linux/Mac):** Use NVM for version management ([GitHub](https://github.com/nvm-sh/nvm)).
   - **Direct Installation (Windows/Mac):** Download from the [Node.js website](https://nodejs.org/).

   **Verify Installation:**

   ```bash
   node -v
   npm -v
   ```

2. **Docker**: Install Docker to manage containers.
   - **Linux:** Follow both [installation](https://docs.docker.com/engine/install/) and [post-install](https://docs.docker.com/engine/install/linux-postinstall/) instructions to avoid permission issues.
   - **Mac/Windows:** Download Docker Desktop from the [official website](https://www.docker.com/products/docker-desktop).

   **Verify Installation:**

   ```bash
   docker --version
   ```

3. **PostgreSQL**: Install PostgreSQL locally or run it via Docker Compose.

   ```bash
   npm run docker:postgres
   ```

   **Apply database migrations:**

   ```bash
   npm run db:migrate
   ```

   **Check PostgreSQL container:**

   ```bash
   npm run docker:postgres:logs
   # OR
   docker ps
   ```

---

## Setting Up the Development Environment

1. **Clone the Repository:**

   ```bash
   git clone git@github.com:goodsoftwaredevteam/good-template.git
   cd good-template
   ```

2. **Install Dependencies:** Install dependencies for all projects.

3. **Set Environment Files:**
   - Locate the `env.example` files in the main server and admin server directories.
   - Request the necessary credentials before starting.

---

## Running the Application Without Docker

### Using nodemon

```bash
npm run dev
```

### Using Node.js

```bash
npm start
```

Access the application at [http://localhost:your-port](http://localhost:your-port).

---

## Dockerized Development (Recommended)

The application is optimized for Docker.

1. **Run Docker Containers:**
   - Start all containers (main client and server, mission control client and server):
     ```bash
     npm run docker:dev
     ```

   **Verify Running Containers:**

   ```bash
   docker ps
   ```

   **Stop Containers:**

   ```bash
   docker stop $(docker ps -aq)
   ```

---

## Notes for macOS and Windows Users

### macOS:

- Use **Homebrew** to install prerequisites:
  ```bash
  brew install node
  brew install docker
  ```

### Windows:

- Use **Windows Subsystem for Linux (WSL)** for a Linux-like experience:
  - Install WSL from the [Microsoft website](https://learn.microsoft.com/en-us/windows/wsl/install).
   - Use WSL to set up Node.js, Docker, and PostgreSQL.

Alternatively, use the standard Windows installers provided on the respective websites.

---
