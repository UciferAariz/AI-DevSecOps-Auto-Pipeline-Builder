import fs from 'node:fs';
import path from 'node:path';

export function generateDevSecOpsFiles(jobId, context) {
  const root = path.join(process.cwd(), 'generated', jobId);
  const files = [
    {
      path: '.github/workflows/devsecops.yml',
      description: 'GitHub Actions pipeline with dependency install placeholders, Trivy scan, Docker build, and artifact upload.',
      content: githubWorkflow(context)
    },
    {
      path: 'Dockerfile',
      description: 'Hardened starter Dockerfile for the detected project type.',
      content: dockerfile(context)
    },
    {
      path: '.dockerignore',
      description: 'Docker build context exclusions.',
      content: dockerignore()
    },
    {
      path: 'k8s/deployment.yaml',
      description: 'Kubernetes deployment with non-root security context and resource boundaries.',
      content: deployment(context)
    },
    {
      path: 'k8s/service.yaml',
      description: 'Kubernetes service for the generated deployment.',
      content: service(context)
    },
    {
      path: 'terraform/main.tf',
      description: 'Cloud-neutral Terraform starter module for future provider-specific deployment.',
      content: terraformMain(context)
    },
    {
      path: 'terraform/variables.tf',
      description: 'Terraform variables for service name, image, and replicas.',
      content: terraformVariables()
    },
    {
      path: 'SECURITY-HARDENING.md',
      description: 'Security hardening checklist tailored to the scan result.',
      content: hardeningGuide(context)
    }
  ];

  for (const file of files) {
    const target = path.join(root, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }

  fs.writeFileSync(path.join(root, 'generated-files.json'), JSON.stringify(files.map(({ content, ...file }) => file), null, 2));
  return files.map(({ content, ...file }) => file);
}

function primaryType(context) {
  return context.projectTypes.find((type) => ['node', 'python', 'java', 'go'].includes(type)) || 'generic';
}

function githubWorkflow(context) {
  const installStep = {
    node: 'npm ci',
    python: 'python -m pip install -r requirements.txt',
    java: 'mvn -B -DskipTests package',
    go: 'go mod download',
    generic: 'echo "Add project-specific dependency install command here"'
  }[primaryType(context)];

  return `name: DevSecOps Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  security-build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: ${installStep}

      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: fs
          format: sarif
          output: trivy-results.sarif
          severity: CRITICAL,HIGH,MEDIUM
          exit-code: "1"

      - name: Upload Trivy SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif

      - name: Build container image
        run: docker build -t app:ci .

      - name: Save security artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: security-artifacts
          path: trivy-results.sarif
`;
}

function dockerfile(context) {
  const type = primaryType(context);
  if (type === 'node') {
    return `FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 3000
CMD ["npm", "start"]
`;
  }
  if (type === 'python') {
    return `FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd --create-home --shell /usr/sbin/nologin appuser
USER appuser
EXPOSE 8000
CMD ["python", "app.py"]
`;
  }
  if (type === 'java') {
    return `FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/*.jar app.jar
RUN useradd --create-home --shell /usr/sbin/nologin appuser
USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`;
  }
  if (type === 'go') {
    return `FROM golang:1.23-alpine AS build
WORKDIR /src
COPY . .
RUN go build -o /out/app ./...

FROM alpine:3.21
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /out/app /app
USER app
EXPOSE 8080
ENTRYPOINT ["/app"]
`;
  }
  return `FROM caddy:2-alpine
COPY . /usr/share/caddy
EXPOSE 80
`;
}

function dockerignore() {
  return `.git
node_modules
dist
build
.env
.venv
__pycache__
coverage
*.log
reports
generated
`;
}

function deployment(context) {
  const name = sanitizeName(context.repoName);
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  labels:
    app: ${name}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: app
          image: ${name}:latest
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
`;
}

function service(context) {
  const name = sanitizeName(context.repoName);
  return `apiVersion: v1
kind: Service
metadata:
  name: ${name}
spec:
  selector:
    app: ${name}
  ports:
    - name: http
      port: 80
      targetPort: 8080
  type: ClusterIP
`;
}

function terraformMain(context) {
  const name = sanitizeName(context.repoName);
  return `terraform {
  required_version = ">= 1.6.0"
}

locals {
  service_name = var.service_name != "" ? var.service_name : "${name}"
  labels = {
    managed_by = "ai-devsecops-builder"
    service    = local.service_name
  }
}

# Cloud provider resources intentionally start as placeholders for the demo.
# Extend this module with AWS, Azure, or GCP resources after selecting a target platform.
output "service_name" {
  value = local.service_name
}

output "container_image" {
  value = var.container_image
}
`;
}

function terraformVariables() {
  return `variable "service_name" {
  type        = string
  description = "Service name used by generated infrastructure resources."
  default     = ""
}

variable "container_image" {
  type        = string
  description = "Container image to deploy."
}

variable "replicas" {
  type        = number
  description = "Desired application replica count."
  default     = 2
}
`;
}

function hardeningGuide(context) {
  return `# Security Hardening Checklist

- Gate CI on critical and high Trivy findings.
- Rotate and remove any detected secrets before deployment.
- Pin dependency ranges and enable automated dependency updates.
- Run containers as non-root users and drop Linux capabilities.
- Keep Kubernetes workloads on read-only root filesystems where possible.
- Store runtime secrets in a managed secret store, not source code or container images.
- Review generated Terraform with provider-specific least-privilege IAM before production use.

Detected project types: ${context.projectTypes.join(', ')}
Existing Dockerfile: ${context.hasDockerfile ? 'yes' : 'no'}
Existing CI workflow: ${context.hasCiWorkflow ? 'yes' : 'no'}
`;
}

function sanitizeName(name) {
  return String(name || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 45) || 'app';
}
