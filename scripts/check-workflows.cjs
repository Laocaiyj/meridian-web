const fs = require('node:fs');
const path = require('node:path');
const yaml = require('yaml');
const check = yaml.parse(
  fs.readFileSync(path.join(__dirname, '../.github/workflows/check.yml'), 'utf8'),
);
const deploy = yaml.parse(
  fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy.yml'), 'utf8'),
);
if (!check.on.push.branches.includes('main') || !check.on.pull_request.branches.includes('main'))
  throw new Error('Checks must cover main and PRs');
if (Object.keys(deploy.on).join() !== 'workflow_dispatch')
  throw new Error('Publishing must be manual');
if (deploy.jobs.build.if !== "github.ref == 'refs/heads/main'")
  throw new Error('Publishing must use main');
if (deploy.jobs.deploy.needs !== 'build')
  throw new Error('Publishing must depend on verified build');
for (const workflow of [check, deploy]) {
  if (workflow.permissions['contents'] !== 'read')
    throw new Error('Default permissions must be read-only');
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps)
      if (step.uses && !/^actions\/[^@]+@[a-f0-9]{40}$/.test(step.uses))
        throw new Error('Use pinned official actions');
  }
}
console.log(
  'Workflow checks passed: main/PR validation, manual main-only deployment, verified artifact, pinned official actions.',
);
