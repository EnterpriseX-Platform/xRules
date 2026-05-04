import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'xrules' },
    update: {},
    create: {
      name: 'XRules Workspace',
      slug: 'xrules',
      description: 'Default workspace',
      plan: 'PRO',
    },
  });

  console.log('Created workspace:', workspace.name);

  // Create demo users with passwords
  const adminPassword = await bcrypt.hash('admin123', 10);
  const editorPassword = await bcrypt.hash('editor123', 10);
  const viewerPassword = await bcrypt.hash('viewer123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
      password: adminPassword,
    },
  });

  const editor = await prisma.user.upsert({
    where: { email: 'editor@example.com' },
    update: {},
    create: {
      email: 'editor@example.com',
      name: 'Editor User',
      password: editorPassword,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@example.com' },
    update: {},
    create: {
      email: 'viewer@example.com',
      name: 'Viewer User',
      password: viewerPassword,
    },
  });

  console.log('Created users: admin, editor, viewer');

  // Create workspace memberships
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: admin.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: admin.id,
      role: 'OWNER',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: editor.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: editor.id,
      role: 'MEMBER',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: viewer.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: viewer.id,
      role: 'VIEWER',
    },
  });

  console.log('Created workspace memberships');

  // Create demo projects
  const loanProject = await prisma.project.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: 'loan-evaluation',
      },
    },
    update: {},
    create: {
      name: 'Loan Evaluation System',
      slug: 'loan-evaluation',
      description: 'Credit scoring and loan approval rules',
      workspaceId: workspace.id,
    },
  });

  const fraudProject = await prisma.project.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: 'fraud-detection',
      },
    },
    update: {},
    create: {
      name: 'Fraud Detection',
      slug: 'fraud-detection',
      description: 'Real-time transaction fraud detection',
      workspaceId: workspace.id,
    },
  });

  const pricingProject = await prisma.project.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: 'pricing-engine',
      },
    },
    update: {},
    create: {
      name: 'Pricing Engine',
      slug: 'pricing-engine',
      description: 'Dynamic pricing and discount rules',
      workspaceId: workspace.id,
    },
  });

  console.log('Created projects');

  // Create rules
  const eligibilityRule = await prisma.rule.upsert({
    where: {
      projectId_slug: {
        projectId: loanProject.id,
        slug: 'basic-eligibility',
      },
    },
    update: {},
    create: {
      name: 'Basic Eligibility',
      slug: 'basic-eligibility',
      description: 'Check basic eligibility criteria',
      type: 'DECISION_TABLE',
      status: 'PUBLISHED',
      version: 1,
      projectId: loanProject.id,
      createdById: admin.id,
      definition: {
        hitPolicy: 'FIRST',
        inputs: [
          { id: 'input-1', name: 'age', label: 'Age', type: 'number' },
          { id: 'input-2', name: 'income', label: 'Annual Income', type: 'number' },
        ],
        outputs: [
          { id: 'output-1', name: 'eligible', label: 'Eligible', type: 'boolean' },
          { id: 'output-2', name: 'reason', label: 'Reason', type: 'string' },
        ],
        rules: [
          {
            id: 'rule-1',
            inputs: ['< 18', '-'],
            outputs: [false, 'Applicant must be 18 or older'],
            annotation: 'Age check',
          },
          {
            id: 'rule-2',
            inputs: ['-', '< 30000'],
            outputs: [false, 'Income below minimum threshold'],
            annotation: 'Income check',
          },
          {
            id: 'rule-3',
            inputs: ['-', '-'],
            outputs: [true, 'Meets basic criteria'],
            annotation: 'Default approval',
          },
        ],
      },
    },
  });

  const creditScoreRule = await prisma.rule.upsert({
    where: {
      projectId_slug: {
        projectId: loanProject.id,
        slug: 'credit-score-check',
      },
    },
    update: {},
    create: {
      name: 'Credit Score Check',
      slug: 'credit-score-check',
      description: 'Evaluate credit score and assign risk level',
      type: 'DECISION_TABLE',
      status: 'DRAFT',
      version: 1,
      projectId: loanProject.id,
      createdById: admin.id,
      definition: {
        hitPolicy: 'FIRST',
        inputs: [
          { id: 'input-1', name: 'creditScore', label: 'Credit Score', type: 'number' },
        ],
        outputs: [
          { id: 'output-1', name: 'riskLevel', label: 'Risk Level', type: 'string' },
          { id: 'output-2', name: 'interestRate', label: 'Interest Rate %', type: 'number' },
        ],
        rules: [
          {
            id: 'rule-1',
            inputs: ['< 600'],
            outputs: ['High', 15.99],
            annotation: 'Poor credit',
          },
          {
            id: 'rule-2',
            inputs: ['>= 600, < 700'],
            outputs: ['Medium', 10.99],
            annotation: 'Fair credit',
          },
          {
            id: 'rule-3',
            inputs: ['>= 700'],
            outputs: ['Low', 7.99],
            annotation: 'Good credit',
          },
        ],
      },
    },
  });

  // Create a pricing rule
  await prisma.rule.upsert({
    where: {
      projectId_slug: {
        projectId: pricingProject.id,
        slug: 'discount-tiers',
      },
    },
    update: {},
    create: {
      name: 'Discount Tiers',
      slug: 'discount-tiers',
      description: 'Determine discount percentage based on customer tier and order amount',
      type: 'DECISION_TABLE',
      status: 'PUBLISHED',
      version: 1,
      projectId: pricingProject.id,
      createdById: admin.id,
      definition: {
        hitPolicy: 'FIRST',
        inputs: [
          { id: 'input-1', name: 'customerTier', label: 'Customer Tier', type: 'string' },
          { id: 'input-2', name: 'orderAmount', label: 'Order Amount', type: 'number' },
        ],
        outputs: [
          { id: 'output-1', name: 'discountPercent', label: 'Discount %', type: 'number' },
          { id: 'output-2', name: 'freeShipping', label: 'Free Shipping', type: 'boolean' },
        ],
        rules: [
          { id: 'rule-1', inputs: ['platinum', '>= 1000'], outputs: [20, true], annotation: 'Platinum high-value' },
          { id: 'rule-2', inputs: ['platinum', '-'], outputs: [15, true], annotation: 'Platinum default' },
          { id: 'rule-3', inputs: ['gold', '>= 500'], outputs: [10, true], annotation: 'Gold high-value' },
          { id: 'rule-4', inputs: ['gold', '-'], outputs: [5, false], annotation: 'Gold default' },
          { id: 'rule-5', inputs: ['-', '>= 1000'], outputs: [5, true], annotation: 'High-value order' },
          { id: 'rule-6', inputs: ['-', '-'], outputs: [0, false], annotation: 'No discount' },
        ],
      },
    },
  });

  console.log('Created rules');

  console.log('Seeding completed!');
  console.log('');
  console.log('Login credentials:');
  console.log('  Admin: admin@example.com / admin123');
  console.log('  Editor: editor@example.com / editor123');
  console.log('  Viewer: viewer@example.com / viewer123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
