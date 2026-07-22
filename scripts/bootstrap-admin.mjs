// One-use production bootstrap for the first organization, property, and GM.
// Supply inputs through a deployment secret manager; no credentials are logged.
if (process.env.NODE_ENV !== 'production') {
  throw new Error('bootstrap:admin requires NODE_ENV=production so demo data can never be created');
}

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const email = required('NEXUSHOS_BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
const password = required('NEXUSHOS_BOOTSTRAP_ADMIN_PASSWORD');
const name = process.env.NEXUSHOS_BOOTSTRAP_ADMIN_NAME?.trim() || 'Initial General Manager';
const propertyName = required('NEXUSHOS_BOOTSTRAP_PROPERTY_NAME');
const propertyCode = required('NEXUSHOS_BOOTSTRAP_PROPERTY_CODE').toUpperCase();
const timezone = required('NEXUSHOS_BOOTSTRAP_PROPERTY_TIMEZONE');
const currency = required('NEXUSHOS_BOOTSTRAP_PROPERTY_CURRENCY').toUpperCase();
const totalRooms = Number(required('NEXUSHOS_BOOTSTRAP_PROPERTY_ROOMS'));

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  throw new Error('NEXUSHOS_BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
}
if (name.length < 2 || name.length > 100) throw new Error('Bootstrap administrator name must contain 2-100 characters');
if (!/^[A-Z0-9_-]{2,20}$/.test(propertyCode)) {
  throw new Error('NEXUSHOS_BOOTSTRAP_PROPERTY_CODE must contain 2-20 letters, digits, underscores, or hyphens');
}
if (!/^[A-Z]{3}$/.test(currency)) throw new Error('NEXUSHOS_BOOTSTRAP_PROPERTY_CURRENCY must be a three-letter code');
if (!Number.isInteger(totalRooms) || totalRooms < 1 || totalRooms > 100_000) {
  throw new Error('NEXUSHOS_BOOTSTRAP_PROPERTY_ROOMS must be an integer from 1 to 100000');
}
try {
  new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
} catch {
  throw new Error('NEXUSHOS_BOOTSTRAP_PROPERTY_TIMEZONE must be a valid IANA time zone');
}
if (password.length < 12 || password.length > 128
  || [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].some((pattern) => !pattern.test(password))) {
  throw new Error('Bootstrap password must contain 12-128 characters with lowercase, uppercase, number, and symbol');
}
const lowerPassword = password.toLowerCase();
if (['password', 'welcome', 'admin123', 'nexushos', 'hotel123'].some((term) => lowerPassword.includes(term))) {
  throw new Error('Bootstrap password contains a commonly guessed term');
}
const personalTokens = [email.split('@')[0], ...name.toLowerCase().split(/[^a-z0-9]+/)]
  .filter((token) => token.length >= 4);
if (personalTokens.some((token) => lowerPassword.includes(token))) {
  throw new Error('Bootstrap password cannot contain the administrator name or email identifier');
}

const [{ db }, { hashPassword }] = await Promise.all([
  import('../server/db.js'),
  import('../server/passwords.js'),
]);
if (Number(db.prepare('SELECT COUNT(*) AS count FROM users').get().count) !== 0) {
  db.close();
  throw new Error('Bootstrap refused: a user already exists');
}

const crypto = await import('node:crypto');
const now = new Date().toISOString();
const organizationId = `org-${crypto.randomUUID()}`;
// The current operational tables are still single-property and use this
// stable key until the PostgreSQL tenant migration in PRODUCT_ROADMAP.md.
const propertyId = 'prop-main';
const userId = `usr-${crypto.randomUUID()}`;
const slugBase = propertyCode.toLowerCase().replace(/[^a-z0-9]+/g, '-');

db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
    .run(organizationId, propertyName, `${slugBase}-${crypto.randomUUID().slice(0, 8)}`, now);
  db.prepare(`INSERT INTO properties
    (id, organization_id, code, name, timezone, currency, locale, total_rooms, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'en', ?, 'Active', ?)`)
    .run(propertyId, organizationId, propertyCode, propertyName, timezone, currency, totalRooms, now);
  db.prepare(`INSERT INTO users
    (id, name, email, password, role, active, must_change_password)
    VALUES (?, ?, ?, ?, 'General Manager', 1, 1)`)
    .run(userId, name, email, hashPassword(password));
  db.prepare(`INSERT INTO user_property_memberships
    (user_id, property_id, role, created_at)
    VALUES (?, ?, 'General Manager', ?)`)
    .run(userId, propertyId, now);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  db.close();
  throw error;
}

console.log(`[bootstrap] created one General Manager and property ${propertyCode}; first login requires password rotation`);
db.close();
