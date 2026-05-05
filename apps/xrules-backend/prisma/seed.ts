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

  // RULE_FLOW rule — visually-orchestrated chain rendered as a graph.
  // Same idea as the SCRIPT rule below but the user can edit the graph
  // visually instead of writing JS.
  await prisma.rule.upsert({
    where: { projectId_slug: { projectId: pricingProject.id, slug: 'order-pricing-flow-rule' } },
    update: {},
    create: {
      name: 'Order Pricing (rule flow)',
      slug: 'order-pricing-flow-rule',
      alias: 'order-pricing',
      description: 'Visual rule flow — input → call Discount Tiers → compute tax + total → output.',
      type: 'RULE_FLOW',
      status: 'PUBLISHED',
      version: 1,
      projectId: pricingProject.id,
      createdById: admin.id,
      inputSchema: {
        type: 'object',
        properties: {
          customerTier: { type: 'string', example: 'platinum' },
          orderAmount:  { type: 'number', example: 1500 },
          taxRate:      { type: 'number', example: 0.07 },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          discountPercent: { type: 'number' },
          subtotal:        { type: 'number' },
          tax:             { type: 'number' },
          total:           { type: 'number' },
          freeShipping:    { type: 'boolean' },
        },
      },
      definition: {
        graph: {
          nodes: [
            { id: 'in',     type: 'input',    position: { x:  60, y: 160 }, data: { label: 'Order Input',     kind: 'input' } },
            { id: 'tier',   type: 'ruleCall', position: { x: 280, y: 160 }, data: {
                label: 'Discount Tiers',
                kind: 'ruleCall',
                ruleSlug: 'discount-tiers',
                inputMap: {
                  customerTier: '{{input.customerTier}}',
                  orderAmount:  '{{input.orderAmount}}',
                },
                outputAs: 'tier',
              },
            },
            { id: 'sub',    type: 'assign',   position: { x: 540, y: 160 }, data: {
                label: 'Subtotal', kind: 'assign',
                target: 'subtotal',
                expression: 'Math.round((input.orderAmount - input.orderAmount * tier.discountPercent / 100) * 100) / 100',
              },
            },
            { id: 'tax',    type: 'assign',   position: { x: 540, y: 260 }, data: {
                label: 'Tax', kind: 'assign',
                target: 'tax',
                expression: 'Math.round(subtotal * (input.taxRate || 0.07) * 100) / 100',
              },
            },
            { id: 'total',  type: 'assign',   position: { x: 800, y: 210 }, data: {
                label: 'Total', kind: 'assign',
                target: 'total',
                expression: 'Math.round((subtotal + tax) * 100) / 100',
              },
            },
            { id: 'out',    type: 'output',   position: { x: 1060, y: 210 }, data: {
                label: 'Quote', kind: 'output',
                return: {
                  discountPercent: '{{tier.discountPercent}}',
                  freeShipping:    '{{tier.freeShipping}}',
                  subtotal:        '{{subtotal}}',
                  tax:             '{{tax}}',
                  total:           '{{total}}',
                },
              },
            },
          ],
          edges: [
            { id: 'e1', source: 'in',   target: 'tier' },
            { id: 'e2', source: 'tier', target: 'sub'  },
            { id: 'e3', source: 'sub',  target: 'tax'  },
            { id: 'e4', source: 'tax',  target: 'total'},
            { id: 'e5', source: 'total',target: 'out'  },
          ],
        },
      },
    },
  });

  // Composite SCRIPT rule that chains into Discount Tiers and adds tax + total.
  // Demonstrates rule-to-rule integration via DR.solve().
  await prisma.rule.upsert({
    where: { projectId_slug: { projectId: pricingProject.id, slug: 'order-quote' } },
    update: {},
    create: {
      name: 'Order Quote (composite)',
      slug: 'order-quote',
      alias: 'order-quote',
      description: 'Chains Discount Tiers via DR.solve, applies tax, returns final quote.',
      type: 'SCRIPT',
      status: 'PUBLISHED',
      version: 1,
      projectId: pricingProject.id,
      createdById: admin.id,
      inputSchema: {
        type: 'object',
        properties: {
          customerTier: { type: 'string', example: 'platinum' },
          orderAmount:  { type: 'number', example: 1500 },
          taxRate:      { type: 'number', example: 0.07 },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          discountPercent: { type: 'number' },
          discountAmount:  { type: 'number' },
          subtotal:        { type: 'number' },
          tax:             { type: 'number' },
          total:           { type: 'number' },
          freeShipping:    { type: 'boolean' },
        },
      },
      definition: {
        source: `
const tier = await DR.solve('discount-tiers', {
  customerTier: input.customerTier,
  orderAmount: input.orderAmount,
});
const pct = Number(tier?.discountPercent ?? 0);
const discountAmount = Math.round(input.orderAmount * pct) / 100 * 100 / 100;
const subtotal = Math.round((input.orderAmount - input.orderAmount * pct / 100) * 100) / 100;
const tax      = Math.round(subtotal * (input.taxRate ?? 0.07) * 100) / 100;
const total    = Math.round((subtotal + tax) * 100) / 100;
return { discountPercent: pct, discountAmount, subtotal, tax, total, freeShipping: !!tier?.freeShipping };
        `.trim(),
      },
    },
  });

  // Sample HTTP Connection — points at httpbin (handy for live demos).
  // Inline AES-256-GCM (mirrors connections.service.ts::encrypt).
  const crypto = await import('node:crypto');
  const KEY = crypto.createHash('sha256')
    .update(process.env.CONNECTION_ENC_KEY || 'dev-only-key-replace-in-production')
    .digest();
  const sampleConfig = JSON.stringify({ authToken: 'demo-token' });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(sampleConfig, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const configEnc = Buffer.concat([iv, tag, enc]).toString('base64');
  await prisma.connection.upsert({
    where: { projectId_slug: { projectId: pricingProject.id, slug: 'httpbin-demo' } },
    update: {},
    create: {
      name: 'httpbin demo',
      slug: 'httpbin-demo',
      type: 'HTTP',
      configEnc,
      meta: { baseUrl: 'https://httpbin.org', authType: 'bearer' },
      projectId: pricingProject.id,
    },
  });

  console.log('Created rules + composite SCRIPT + sample Connection');

  // Sample Flow that demonstrates orchestration:
  //   Input → HTTP fetch (httpbin) → Rule call (discount-tiers) → Output
  await prisma.flow.upsert({
    where: { projectId_slug: { projectId: pricingProject.id, slug: 'order-pricing-flow' } },
    update: {},
    create: {
      name: 'Order Pricing Flow',
      slug: 'order-pricing-flow',
      alias: 'order-pricing',
      description: 'Fetch customer tier from external API, then run Discount Tiers and return the quote.',
      kind: 'DECISION',
      status: 'PUBLISHED',
      version: 1,
      projectId: pricingProject.id,
      inputSchema: {
        type: 'object',
        properties: {
          customerId:  { type: 'string', example: 'cust-12345' },
          orderAmount: { type: 'number', example: 1500 },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          discountPercent: { type: 'number' },
          freeShipping:    { type: 'boolean' },
        },
      },
      graph: {
        nodes: [
          {
            id: 'n_input',
            type: 'input',
            position: { x: 60, y: 120 },
            data: { label: 'Order Input', kind: 'input' },
          },
          {
            id: 'n_http',
            type: 'http',
            position: { x: 280, y: 120 },
            data: {
              label: 'Fetch customer tier',
              kind: 'http',
              connectionSlug: 'httpbin-demo',
              method: 'GET',
              path: '/anything?customerId={{input.customerId}}&tier=platinum',
              outputAs: 'customer',
            },
          },
          {
            id: 'n_rule',
            type: 'ruleCall',
            position: { x: 560, y: 120 },
            data: {
              label: 'Discount Tiers',
              kind: 'ruleCall',
              ruleSlug: 'discount-tiers',
              inputMap: {
                customerTier: '{{customer.args.tier}}',
                orderAmount:  '{{input.orderAmount}}',
              },
            },
          },
          {
            id: 'n_output',
            type: 'output',
            position: { x: 840, y: 120 },
            data: { label: 'Final Quote', kind: 'output' },
          },
        ],
        edges: [
          { id: 'e1', source: 'n_input',  target: 'n_http' },
          { id: 'e2', source: 'n_http',   target: 'n_rule' },
          { id: 'e3', source: 'n_rule',   target: 'n_output' },
        ],
      },
    },
  });
  console.log('Created sample Flow: order-pricing-flow');

  // Snapshot every PUBLISHED rule into RuleVersion so the Versions tab
  // shows entries and version-pinning works against seed data.
  const publishedRules = await prisma.rule.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, version: true, definition: true, inputSchema: true, outputSchema: true },
  });
  for (const r of publishedRules) {
    await prisma.ruleVersion.upsert({
      where: { ruleId_version: { ruleId: r.id, version: r.version } },
      update: {},
      create: {
        ruleId: r.id,
        version: r.version,
        status: 'PUBLISHED',
        message: 'Initial seed snapshot',
        definition: r.definition as object,
        inputSchema: r.inputSchema as object | null,
        outputSchema: r.outputSchema as object | null,
        createdById: admin.id,
      },
    });
  }
  console.log(`Snapshotted ${publishedRules.length} published rules into RuleVersion`);

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
