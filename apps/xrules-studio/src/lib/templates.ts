// Starter templates shipped with the studio. Each is a self-contained rule definition
// that can be dropped into a project. Categories make browsing easier.
export interface Template {
  slug: string;
  name: string;
  description: string;
  category: string;
  type: string;
  inputSchema: any;
  outputSchema: any;
  definition: any;
}

export const TEMPLATES: Template[] = [
  {
    slug: 'discount-tiers',
    name: 'Customer Discount Tiers',
    category: 'Pricing',
    type: 'DECISION_TABLE',
    description: 'Map customer tier × order amount to a discount percentage and free-shipping flag.',
    inputSchema: {
      type: 'object',
      properties: {
        customerTier: { type: 'string', enum: ['platinum', 'gold', 'silver', 'bronze'] },
        orderAmount: { type: 'number' },
      },
      required: ['customerTier', 'orderAmount'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        discountPercent: { type: 'number' },
        freeShipping: { type: 'boolean' },
      },
    },
    definition: {
      hitPolicy: 'FIRST',
      inputs: [{ name: 'customerTier', type: 'string' }, { name: 'orderAmount', type: 'number' }],
      outputs: [{ name: 'discountPercent', type: 'number' }, { name: 'freeShipping', type: 'boolean' }],
      rules: [
        { id: 'r1', inputs: ['platinum', '>= 1000'], outputs: [20, true], annotation: 'Platinum high value' },
        { id: 'r2', inputs: ['platinum', '-'], outputs: [15, true], annotation: 'Platinum default' },
        { id: 'r3', inputs: ['gold', '>= 500'], outputs: [10, true], annotation: 'Gold high value' },
        { id: 'r4', inputs: ['gold', '-'], outputs: [5, false] },
        { id: 'r5', inputs: ['silver', '-'], outputs: [3, false] },
        { id: 'r6', inputs: ['bronze', '-'], outputs: [0, false] },
      ],
    },
  },
  {
    slug: 'kyc-tier',
    name: 'KYC Tier Assignment',
    category: 'Compliance',
    type: 'DECISION_TREE',
    description: 'Assign a Know-Your-Customer verification tier (basic / enhanced / strict) based on country, occupation, and amount.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string' }, occupation: { type: 'string' }, monthlyAmount: { type: 'number' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { tier: { type: 'string' }, requiresReview: { type: 'boolean' } },
    },
    definition: {
      root: {
        type: 'if',
        conditions: [{ field: 'country', op: 'IN', value: 'KP,IR,SY,CU' }],
        orGroups: [],
        then: { type: 'then', outputs: { tier: 'strict', requiresReview: true } },
        else: {
          type: 'if',
          conditions: [{ field: 'monthlyAmount', op: '>=', value: '50000' }],
          orGroups: [],
          then: { type: 'then', outputs: { tier: 'enhanced', requiresReview: true } },
          else: { type: 'then', outputs: { tier: 'basic', requiresReview: false } },
        },
      },
    },
  },
  {
    slug: 'fraud-score',
    name: 'Fraud Risk Scoring',
    category: 'Risk',
    type: 'SCORECARD',
    description: 'Add up risk points across geography, velocity, device, and amount features. Threshold determines decision.',
    inputSchema: {
      type: 'object',
      properties: {
        countryRisk: { type: 'string', enum: ['low', 'medium', 'high'] },
        velocityHourly: { type: 'number' },
        newDevice: { type: 'boolean' },
        amount: { type: 'number' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { score: { type: 'number' }, decision: { type: 'string' } },
    },
    definition: {
      attributes: [
        { name: 'countryRisk', bands: [
          { match: { eq: 'low' }, points: 0 },
          { match: { eq: 'medium' }, points: 15 },
          { match: { eq: 'high' }, points: 40 },
        ]},
        { name: 'velocityHourly', bands: [
          { match: { lt: 3 }, points: 0 },
          { match: { btw: [3, 10] }, points: 10 },
          { match: { gte: 10 }, points: 30 },
        ]},
        { name: 'newDevice', bands: [
          { match: { eq: false }, points: 0 },
          { match: { eq: true }, points: 15 },
        ]},
        { name: 'amount', bands: [
          { match: { lt: 1000 }, points: 0 },
          { match: { btw: [1000, 10000] }, points: 10 },
          { match: { gte: 10000 }, points: 25 },
        ]},
      ],
      thresholds: [
        { score: 70, decision: 'block' },
        { score: 40, decision: 'review' },
        { score: 0,  decision: 'approve' },
      ],
    },
  },
  {
    slug: 'credit-score',
    name: 'Credit Approval Scorecard',
    category: 'Lending',
    type: 'SCORECARD',
    description: 'Classic FICO-style scorecard. Sum points across age, income, employment, debt ratio.',
    inputSchema: {
      type: 'object',
      properties: {
        age: { type: 'number' }, monthlyIncome: { type: 'number' },
        employmentType: { type: 'string', enum: ['full-time', 'part-time', 'self-employed', 'unemployed'] },
        debtRatio: { type: 'number' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { score: { type: 'number' }, decision: { type: 'string' } },
    },
    definition: {
      attributes: [
        { name: 'age', bands: [
          { match: { lt: 25 }, points: 5 },
          { match: { btw: [25, 40] }, points: 20 },
          { match: { gte: 40 }, points: 15 },
        ]},
        { name: 'monthlyIncome', bands: [
          { match: { lt: 30000 }, points: 0 },
          { match: { btw: [30000, 100000] }, points: 25 },
          { match: { gte: 100000 }, points: 40 },
        ]},
        { name: 'employmentType', bands: [
          { match: { eq: 'full-time' }, points: 30 },
          { match: { eq: 'part-time' }, points: 15 },
          { match: { eq: 'self-employed' }, points: 10 },
          { match: { eq: 'unemployed' }, points: 0 },
        ]},
        { name: 'debtRatio', bands: [
          { match: { lt: 0.3 }, points: 30 },
          { match: { btw: [0.3, 0.5] }, points: 15 },
          { match: { gte: 0.5 }, points: 0 },
        ]},
      ],
      thresholds: [
        { score: 80, decision: 'approve' },
        { score: 50, decision: 'review' },
        { score: 0,  decision: 'reject' },
      ],
    },
  },
  {
    slug: 'shipping-cost',
    name: 'Shipping Cost Formula',
    category: 'Logistics',
    type: 'FORMULA',
    description: 'Compute shipping cost: base + per-kg + distance multiplier.',
    inputSchema: {
      type: 'object',
      properties: { weightKg: { type: 'number' }, distanceKm: { type: 'number' }, express: { type: 'boolean' } },
    },
    outputSchema: { type: 'object', properties: { cost: { type: 'number' } } },
    definition: { expression: '50 + (weightKg * 12) + (distanceKm * 0.5) + (express ? 100 : 0)' },
  },
  {
    slug: 'currency-rates',
    name: 'Currency Rates Lookup',
    category: 'Reference',
    type: 'LOOKUP',
    description: 'Look up USD conversion rate for a 3-letter currency code.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { rate: { type: 'number' }, name: { type: 'string' } } },
    definition: {
      primaryKey: 'code',
      columns: [{ name: 'code', type: 'string' }, { name: 'rate', type: 'number' }, { name: 'name', type: 'string' }],
      rows: [
        { code: 'USD', rate: 1, name: 'US Dollar' },
        { code: 'EUR', rate: 1.08, name: 'Euro' },
        { code: 'GBP', rate: 1.27, name: 'British Pound' },
        { code: 'JPY', rate: 0.0066, name: 'Japanese Yen' },
        { code: 'THB', rate: 0.028, name: 'Thai Baht' },
        { code: 'SGD', rate: 0.74, name: 'Singapore Dollar' },
      ],
    },
  },
  {
    slug: 'sentiment-classifier',
    name: 'Customer Feedback Sentiment',
    category: 'AI',
    type: 'AI_AGENT',
    description: 'LLM classifies feedback text as positive / neutral / negative + extracts top issues.',
    inputSchema: { type: 'object', properties: { feedback: { type: 'string' } } },
    outputSchema: {
      type: 'object',
      properties: {
        sentiment: { type: 'string' },
        confidence: { type: 'number' },
        topIssues: { type: 'array', items: { type: 'string' } },
      },
    },
    definition: {
      model: 'gpt-4o-mini',
      cacheEnabled: false,
      explainable: true,
      prompt: 'Classify the sentiment of the following customer feedback as one of: positive | neutral | negative. Identify up to 3 top issues raised.\n\nFeedback:\n{feedback}',
      annotations: [
        { field: 'sentiment',   type: 'text',   description: 'positive | neutral | negative' },
        { field: 'confidence',  type: 'number', description: '0..1 model confidence' },
        { field: 'topIssues',   type: 'array',  description: 'Up to 3 issue tags as short strings' },
      ],
      attachments: [],
    },
  },
  {
    slug: 'eligibility-check',
    name: 'Loan Eligibility',
    category: 'Lending',
    type: 'DECISION_TABLE',
    description: 'Determine if applicant is eligible based on age, income, employment.',
    inputSchema: {
      type: 'object',
      properties: { age: { type: 'number' }, income: { type: 'number' }, employmentMonths: { type: 'number' } },
    },
    outputSchema: { type: 'object', properties: { eligible: { type: 'boolean' }, reason: { type: 'string' } } },
    definition: {
      hitPolicy: 'FIRST',
      inputs: [{ name: 'age', type: 'number' }, { name: 'income', type: 'number' }, { name: 'employmentMonths', type: 'number' }],
      outputs: [{ name: 'eligible', type: 'boolean' }, { name: 'reason', type: 'string' }],
      rules: [
        { id: 'r1', inputs: ['< 18', '-', '-'], outputs: [false, 'Underage'] },
        { id: 'r2', inputs: ['-', '< 15000', '-'], outputs: [false, 'Income below threshold'] },
        { id: 'r3', inputs: ['-', '-', '< 6'], outputs: [false, 'Employment too short'] },
        { id: 'r4', inputs: ['-', '-', '-'], outputs: [true, 'Eligible'] },
      ],
    },
  },
  {
    slug: 'tax-classifier',
    name: 'VAT Rate Classifier',
    category: 'Tax',
    type: 'DECISION_TABLE',
    description: 'Pick VAT rate by product category and customer country (EU / UK / non-EU).',
    inputSchema: {
      type: 'object',
      properties: { productCategory: { type: 'string' }, country: { type: 'string' }, b2b: { type: 'boolean' } },
    },
    outputSchema: { type: 'object', properties: { vatRate: { type: 'number' }, code: { type: 'string' } } },
    definition: {
      hitPolicy: 'FIRST',
      inputs: [{ name: 'productCategory', type: 'string' }, { name: 'country', type: 'string' }, { name: 'b2b', type: 'boolean' }],
      outputs: [{ name: 'vatRate', type: 'number' }, { name: 'code', type: 'string' }],
      rules: [
        { id: 'r1', inputs: ['-', 'IN GB,DE,FR,IT,ES', 'true'],  outputs: [0,    'reverse-charge'] },
        { id: 'r2', inputs: ['food', 'IN GB,DE,FR,IT,ES', '-'],  outputs: [0.05, 'eu-food'] },
        { id: 'r3', inputs: ['-',     'IN GB,DE,FR,IT,ES', '-'], outputs: [0.20, 'eu-standard'] },
        { id: 'r4', inputs: ['-',     '-', '-'],                  outputs: [0,    'no-vat'] },
      ],
    },
  },
  {
    slug: 'risk-policy-script',
    name: 'Custom Risk Policy (Script)',
    category: 'Risk',
    type: 'SCRIPT',
    description: 'JavaScript-based policy that combines lookup + branching for high flexibility. Edit freely.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number' }, currency: { type: 'string' },
        customer: { type: 'object', properties: { kyc: { type: 'string' }, ageMonths: { type: 'number' } } },
      },
    },
    outputSchema: {
      type: 'object',
      properties: { decision: { type: 'string' }, score: { type: 'number' } },
    },
    definition: {
      language: 'javascript',
      source: `// Inputs: input.amount, input.currency, input.customer.kyc, input.customer.ageMonths
const usdAmount = input.amount * (ruleVariables.rates?.[input.currency] || 1);
let score = 0;

if (input.customer.kyc !== 'enhanced') score += 30;
if (input.customer.ageMonths < 6)      score += 20;
if (usdAmount > 10000)                 score += 25;

const output = {
  decision: score > 50 ? 'block' : score > 25 ? 'review' : 'approve',
  score,
};
return output;
`,
    },
  },
];
