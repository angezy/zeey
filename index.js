const express = require('express');
const path = require('path');
const { engine } = require('express-handlebars');
require('dotenv').config();
const connectToDatabase = require('./config/db');
const authRoutes = require('./routes/auth');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const authMiddleware = require('./middleware/authMiddleware');
const cbform = require('./routes/cashbuyer-route');
const fastSell = require('./routes/fastSell');
const contacts = require('./routes/contacts');
const listing = require('./routes/listing');
const propertyFinderRoutes = require('./routes/propertyFinder');
const blogsRoutes = require('./routes/blogsRoutes');
const contactusRoute = require('./routes/contactus-route'); // New route for contact form
const kanbanRoutes = require('./routes/kanban');
const sql = require('mssql');
const dbConfig = require("./config/db");
const Handlebars = require('handlebars');
const session = require('express-session');
const validator = require('validator');
const { normalizeIp } = require('./utils/clientIp');
const { ensureBirdDogTables, ensureListingsArvColumn, ensureBlogSeoColumns } = require('./utils/dbMigrations');

const app = express();
const port = process.env.PORT;
// Respect X-Forwarded-For / X-Real-IP when behind a proxy (e.g., Nginx/Cloudflare)
app.set('trust proxy', true);

// Lightweight DB migrations (best-effort, non-fatal)
(async () => {
  try {
    const pool = await sql.connect(dbConfig);
    const { changed } = await ensureListingsArvColumn(pool);
    if (changed) console.log('[db] Added missing column dbo.listings_tbl.ARV');
    const { changed: seoChanged } = await ensureBlogSeoColumns(pool);
    if (seoChanged) console.log('[db] Added missing SEO columns to dbo.BlogPosts_tbl');
    const { changed: birdDogChanged } = await ensureBirdDogTables(pool);
    if (birdDogChanged) console.log('[db] Created missing bird dog tables');
  } catch (err) {
    console.error('[db] Migration error:', err && err.message ? err.message : err);
  } finally {
    try { sql.close(); } catch (e) {}
  }
})();

// Expose site and geo metadata to views (can be overridden via environment variables)
app.locals.geo = {
  lat: process.env.GEO_LAT || '27.994402',
  lon: process.env.GEO_LON || '-81.760254',
  region: process.env.GEO_REGION || 'US-FL',
  placename: process.env.GEO_PLACENAME || 'Florida',
  country: process.env.GEO_COUNTRY || 'US',
};
app.locals.site = {
  url: process.env.SITE_URL || (`http://localhost:${process.env.PORT || 3000}`),
  name: process.env.SITE_NAME || 'Nick House Buyer'
};

// Expose contact phone (use env or fallback to provided US number)
app.locals.site.phone = process.env.SITE_PHONE || '+13235531922';
app.locals.site.logo = process.env.SITE_LOGO || '/assets/img/favicon.png';
app.locals.site.socials = (process.env.SITE_SOCIALS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.locals.site.ratingValue = process.env.SITE_RATING_VALUE || '';
app.locals.site.reviewCount = process.env.SITE_REVIEW_COUNT || '';

const getBaseUrl = () => app.locals.site.url.replace(/\/$/, '');
const getPageUrl = (req) => `${getBaseUrl()}${(req.originalUrl || req.path || '/').split('?')[0]}`;
const toAbsoluteUrl = (base, value) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const pathPart = value.startsWith('/') ? value : `/${value}`;
  return `${base}${pathPart}`;
};
const toIsoDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};
const buildBreadcrumb = (items) => ({
  "@type": "BreadcrumbList",
  "itemListElement": items.map((item, index) => ({
    "@type": "ListItem",
    "position": index + 1,
    "name": item.name,
    "item": item.url
  }))
});
const buildBaseGraph = (req) => {
  const baseUrl = getBaseUrl();
  const logoUrl = toAbsoluteUrl(baseUrl, app.locals.site.logo);
  const orgId = `${baseUrl}#organization`;
  const localBusinessId = `${baseUrl}#localbusiness`;
  const websiteId = `${baseUrl}#website`;
  const organization = {
    "@type": "Organization",
    "@id": orgId,
    "name": app.locals.site.name,
    "url": baseUrl,
    "logo": {
      "@type": "ImageObject",
      "url": logoUrl
    }
  };
  if (app.locals.site.socials.length) {
    organization.sameAs = app.locals.site.socials;
  }

  const localBusiness = {
    "@type": ["LocalBusiness", "RealEstateAgent"],
    "@id": localBusinessId,
    "name": app.locals.site.name,
    "url": baseUrl,
    "telephone": app.locals.site.phone,
    "image": logoUrl,
    "address": {
      "@type": "PostalAddress",
      "addressRegion": "FL",
      "addressCountry": "US"
    },
    "areaServed": [
      { "@type": "City", "name": "Tampa", "addressRegion": "FL", "addressCountry": "US" },
      { "@type": "City", "name": "Orlando", "addressRegion": "FL", "addressCountry": "US" },
      { "@type": "City", "name": "Miami", "addressRegion": "FL", "addressCountry": "US" },
      { "@type": "City", "name": "Jacksonville", "addressRegion": "FL", "addressCountry": "US" }
    ],
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": app.locals.geo.lat,
      "longitude": app.locals.geo.lon
    }
  };
  const ratingValue = parseFloat(app.locals.site.ratingValue);
  const reviewCount = parseInt(app.locals.site.reviewCount, 10);
  if (Number.isFinite(ratingValue) && Number.isFinite(reviewCount) && reviewCount > 0) {
    localBusiness.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": ratingValue,
      "reviewCount": reviewCount
    };
  }

  const website = {
    "@type": "WebSite",
    "@id": websiteId,
    "url": baseUrl,
    "name": app.locals.site.name,
    "publisher": { "@id": orgId },
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${baseUrl}/properties?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };

  return [organization, localBusiness, website];
};
const buildServiceSchema = () => {
  const baseUrl = getBaseUrl();
  return {
    "@type": "Service",
    "@id": `${baseUrl}#service-cash-offer`,
    "name": "Sell House Fast for Cash in Florida",
    "serviceType": "Cash home buying",
    "areaServed": {
      "@type": "State",
      "name": "Florida"
    },
    "provider": { "@id": `${baseUrl}#localbusiness` }
  };
};
const buildOfferSchema = () => {
  const baseUrl = getBaseUrl();
  return {
    "@type": "Offer",
    "@id": `${baseUrl}#cash-offer`,
    "name": "Cash offer for Florida homes",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "itemOffered": { "@id": `${baseUrl}#service-cash-offer` },
    "description": "Cash offer amount is based on property condition and local market data."
  };
};
const buildBlogPostingSchema = (post, postId) => {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/blog/${postId}`;
  const imageUrl = toAbsoluteUrl(baseUrl, post.Imag || app.locals.site.logo);
  const published = toIsoDate(post.CreatedAt);
  const modified = published; // Use CreatedAt as the modification date
  const headline = post.ArticleTitle || post.Title;
  const description = post.ArticleDescription || post.Description;
  const schema = {
    "@type": "BlogPosting",
    "@id": `${url}#blogposting`,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": url
    },
    "headline": headline,
    "description": description,
    "image": imageUrl ? [imageUrl] : undefined,
    "author": { "@type": "Organization", "@id": `${baseUrl}#organization`, "name": app.locals.site.name },
    "publisher": { "@id": `${baseUrl}#organization` }
  };
  if (published) schema.datePublished = published;
  if (modified) schema.dateModified = modified;
  if (!schema.image) delete schema.image;
  return schema;
};
const buildFaqSchema = (questions, pageUrl) => ({
  "@type": "FAQPage",
  "@id": `${pageUrl}#faq`,
  "mainEntity": questions.map(item => ({
    "@type": "Question",
    "name": item.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": item.answer
    }
  }))
});
const buildJsonLd = (graph) => ({
  "@context": "https://schema.org",
  "@graph": graph
});

// Sitemap route (dynamic) to produce sitemap.xml based on known public routes
app.get('/sitemap.xml', async (req, res) => {
  const base = app.locals.site.url.replace(/\/$/, '');
  res.header('Content-Type', 'application/xml');
  try {
    let pool = await sql.connect(dbConfig);

    // Static pages
    const staticPages = ['/', '/properties', '/blogs', '/contactus', '/privacy-policy', '/terms-of-service', '/property-finder', '/property-finder/agreement'];
    const now = new Date().toISOString();

    // Fetch available properties
    const propsResult = await pool.request().query('SELECT listingId, CreatedAt, Available FROM dbo.listings_tbl WHERE Available = 1');
    const properties = (propsResult.recordset || []).map(r => ({
      loc: `${base}/property/${r.listingId}`,
      lastmod: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : now
    }));

    // Fetch blog posts
    const postsResult = await pool.request().query('SELECT postId, CreatedAt FROM dbo.BlogPosts_tbl');
    const posts = (postsResult.recordset || []).map(p => ({
      loc: `${base}/blog/${p.postId}`,
      lastmod: p.CreatedAt ? new Date(p.CreatedAt).toISOString() : now
    }));

    const allUrls = [];

    // add static
    staticPages.forEach(p => allUrls.push({ loc: `${base}${p}`, lastmod: now }));
    // add properties and posts
    properties.forEach(u => allUrls.push(u));
    posts.forEach(u => allUrls.push(u));

    const urlsXml = allUrls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>`;
    res.send(xml);
  } catch (err) {
    console.error('Error building sitemap:', err);
    // Fallback to minimal sitemap
    const now = new Date().toISOString();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${base}/</loc>\n    <lastmod>${now}</lastmod>\n  </url>\n</urlset>`;
    res.status(500).send(xml);
  } finally {
    try { sql.close(); } catch (e) {}
  }
});

// Middleware to handle cookies
app.use(cookieParser());

// Middleware to parse JSON and URL-encoded requests (raise limits for uploads with metadata)
// Keep this in sync with IIS/web.config (maxAllowedContentLength) to avoid 413 errors. Default to a higher ceiling for production; override with BODY_LIMIT if your host enforces a smaller cap.
const bodyLimit = process.env.BODY_LIMIT || '200mb';
app.use(bodyParser.urlencoded({ extended: true, limit: bodyLimit }));
app.use(bodyParser.json({ limit: bodyLimit }));

// Configure session middleware
app.use(session({
  secret: process.env.SESEC ,
  resave: false,
  saveUninitialized: true,
  // Use secure cookies only in production (HTTPS). For local dev over HTTP set to false.
  cookie: { secure: (process.env.NODE_ENV === 'production') }
}));

// Middleware to parse JSON requests (keep limit in sync)
app.use(express.json({ limit: bodyLimit }));

// Default JSON-LD for public pages (can be overridden per-route)
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.locals.jsonLd = buildJsonLd(buildBaseGraph(req));
  next();
});

// Set up Handlebars
app.engine('handlebars', engine({
  defaultLayout: 'main',
  partialsDir: path.join(__dirname, 'views/partials'),
  layoutsDir: path.join(__dirname, 'views/layouts'),
}));
app.set('view engine', 'handlebars');
app.set('views', [path.join(__dirname, 'views'),
  path.join(__dirname, 'views/forms'),
  path.join(__dirname, 'views/dashboard')]);

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/auth', authRoutes);
app.use('/api', cbform);
app.use('/api', fastSell);
app.use('/api', kanbanRoutes);
app.use('/api', listing);
app.use('/api', contactusRoute);
app.use('/api', blogsRoutes);
app.use('/api', contacts);
app.use('/api', propertyFinderRoutes);
const listingsRouter = require('./routes/listing');
app.use('/', listingsRouter);

// Register a custom helper to format the date
Handlebars.registerHelper('formatDate', function (date) {
  const formattedDate = new Date(date).toString().split(' GMT')[0];
  return formattedDate;
});
Handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});
Handlebars.registerHelper('json', function (context) {
  return JSON.stringify(context);
});
Handlebars.registerHelper('jsonSafe', function (context) {
  try {
    const json = JSON.stringify(context);
    const safe = json.replace(/<\/script/gi, '<\\/script');
    return new Handlebars.SafeString(safe);
  } catch (e) {
    return new Handlebars.SafeString('[]');
  }
});
// Sanitize strings for display: normalize only problematic slashes
Handlebars.registerHelper('sanitize', function (value) {
  if(value === null || value === undefined) return '';
  try {
    var s = String(value);
    // Only replace backslashes and fullwidth slashes, leave normal '/' alone
    s = s.replace(/[\\\uFF0F]/g, function(match) {
      // Don't replace if it's already a normal forward slash
      if (match === '/') return match;
      return '/';
    });
    // Normalize newlines (and common escaped variants) to spaces
    s = s.replace(/(?:\r\n|\r|\n|\\n|\/n)/g, ' ');
    // Collapse extra whitespace so UI doesn't render odd gaps
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  } catch(e) { return String(value); }
});
Handlebars.registerHelper('cleanIp', function (value) {
  return normalizeIp(value) || '';
});
Handlebars.registerHelper('split', function (value, delimiter) {
  if(value === null || value === undefined) return [];
  try {
    var parts = String(value).split(delimiter || ',').map(function(item){ return item.trim(); }).filter(Boolean);
    return parts;
  } catch(e) {
    return [];
  }
});
Handlebars.registerHelper('set', function (key, value, options) {
  if (!options || !options.data) return '';
  options.data.root = options.data.root || {};
  options.data.root[key] = value;
  return '';
});
Handlebars.registerHelper('get', function (key, options) {
  const data = (options && options.data && options.data.root) || {};
  return data[key] || '';
});
Handlebars.registerHelper('formatCurrency', function (value) {
  if (value === null || value === undefined || value === '') return '';
  var num = Number(value);
  if (isNaN(num)) return value;
  return num.toLocaleString('en-US');
});
Handlebars.registerHelper('firstImage', function (value) {
  if (!value) return '';
  try {
    var first = String(value).split(',')[0].trim();
    if (!first) return '';
    first = first.replace(/^\/+/, '/');
    return first.startsWith('/') ? first : '/' + first;
  } catch (e) {
    return value;
  }
});
Handlebars.registerHelper('photoUrl', function (value) {
  if (!value && value !== 0) return '';
  try {
    var str = String(value).trim();
    if (!str) return '';
    if (/^https?:\/\//i.test(str)) return str;
    str = str.replace(/^\/+/, '').replace(/\\/g, '/');
    return str ? '/' + str : '';
  } catch (e) {
    return value;
  }
});

// Format square-footage nicely. Accepts primary and fallback values (e.g. SquareFootage, FloorArea).
Handlebars.registerHelper('formatSqft', function (value, fallback) {
  // prefer first non-empty value
  var pick = function(v){ return (v !== null && v !== undefined && String(v).trim() !== '') ? v : null; };
  var chosen = pick(value) || pick(fallback);
  if (!chosen) return 'N/A';
  try {
    var s = String(chosen).replace(/[\\\uFF0F]/g, '/');
    // remove any trailing .0 for integers coming from floats
    if (/^\d+\.0+$/.test(s)) s = String(parseInt(Number(s),10));
    return s + ' sqft';
  } catch (e) {
    return String(chosen) + ' sqft';
  }
});

const fetchBlogPost = async (postId) => {
  try {
    let pool = await sql.connect(dbConfig);
    let result = await pool.request()
      .input('PostId', sql.Int, postId)
      .query(`SELECT Title, Imag, Contents, Description, SeoJsonLd, CreatedAt,
        Category, PrimaryKeyword, SecondaryKeywords, Slug, FeaturedImageIdea, FeaturedImageAltText,
        Tags, ArticleTitle, ArticleDescription, Content, Cta
        FROM dbo.BlogPosts_tbl WHERE postId = @PostId`);
    return result.recordset[0];
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  } finally {
    sql.close();
}};
async function fetchBlogPosts() {
  try {
    let pool = await sql.connect(dbConfig);
    let result = await pool.request()
    .query(`SELECT postId, Title, Description, Imag, Contents, SeoJsonLd, CreatedAt,
      Category, PrimaryKeyword, SecondaryKeywords, Slug, FeaturedImageIdea, FeaturedImageAltText,
      Tags, ArticleTitle, ArticleDescription, Content, Cta
      FROM dbo.BlogPosts_tbl`);
    return result.recordset;
  } catch (err) {
    console.error('Error fetching blog posts:', err);
    throw new Error('Error fetching blog posts');
  } finally {
    sql.close();
}};
 
const fetchlistPost = async (listingId) => {
  try {
    let pool = await sql.connect(dbConfig);
    let result = await pool.request()
      .input('listingId', sql.Int, listingId)
      .query('SELECT * FROM dbo.listings_tbl WHERE listingId = @listingId');
    return result.recordset[0];
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  } finally {
    sql.close();
}};

// Terms of Service/Privacy Policy 
app.get('/privacy-policy', (req, res) => {
  res.render('privacy-policy', { title: `Nick House Buyer Privacy Policy ` });
});
app.get('/terms-of-service', (req, res) => {
  res.render('terms-of-service', { title: `Nick House Buyer Terms Of Service` });
});

// Forms routes
app.get('/forms/Cash-Buyer', (req, res) => {
  // If there is form data saved in session (from a previous failed submit), pass it to the template
  const formValues = (req.session && req.session.cbForm && req.session.cbForm.values) ? req.session.cbForm.values : {};
  const formErrors = (req.session && req.session.cbForm && req.session.cbForm.errors) ? req.session.cbForm.errors : null;

  // Clear the saved form from session so it does not persist indefinitely
  try {
    // NOTE: do NOT clear session.cbForm here; the client-side `/api/cbForm/restore` endpoint
    // will read and clear the session (one-time). Removing deletion here ensures the restore
    // endpoint can return the saved payload (including price min/max and uploaded file path).
  } catch (e) {
    console.error('Could not access session cbForm:', e.message);
  }

  res.render('cashbuyers', { title: ` Nick's Cash Buyers Form `, layout: false, formValues, formErrors, success: req.query.success, message: req.query.message });
});
app.get('/forms/fastSell', (req, res) => {
  res.render('fastSell', { title: ` Fast Sell House `, layout: false });
});
app.get('/forms/listing', (req, res) => {
  res.render('listing', { title: ` Fast Sell Property `, layout: false });
});
app.get('/forms/contacts', (req, res )=>{
res.render('contacts', { title: ` Contact Nick House Buyer `, layout: false });
});

// public routes
app.get('/', async (req, res) => {
  try {
    const blogPosts = await fetchBlogPosts();
    const recentPosts = blogPosts.slice(0, 4);
    const baseGraph = buildBaseGraph(req);
    const pageUrl = getPageUrl(req);
    baseGraph.push(
      buildServiceSchema(),
      buildOfferSchema(),
      buildBreadcrumb([{ name: 'Home', url: pageUrl }])
    );
    res.render('index', { title: `Nick House Buyer`, blogs: recentPosts, jsonLd: buildJsonLd(baseGraph) })
} catch (err) {
    res.status(500).send(err.message);
} finally {
  sql.close();
}
});
app.get('/about', (req, res) => {
  const baseGraph = buildBaseGraph(req);
  const pageUrl = getPageUrl(req);
  baseGraph.push(buildBreadcrumb([
    { name: 'Home', url: `${getBaseUrl()}/` },
    { name: 'About', url: pageUrl }
  ]));
  res.render('about', { title: 'About Nick House Buyer', jsonLd: buildJsonLd(baseGraph) });
});
app.get('/faq', (req, res) => {
  const pageUrl = getPageUrl(req);
  const baseGraph = buildBaseGraph(req);
  const faqItems = [
    {
      question: 'Are you listing my house on the MLS or buying it directly?',
      answer: 'We buy houses directly. We are not listing your property or acting as a real estate agent.'
    },
    {
      question: 'Do you pay fair prices?',
      answer: 'We make fair, realistic offers based on market data and the property condition.'
    },
    {
      question: 'How do you determine the offer price?',
      answer: 'We review the location, recent comparable sales, and the scope of repairs needed to make the home market-ready.'
    },
    {
      question: 'What is the process from start to close?',
      answer: 'Share your property details, receive a no-obligation cash offer, and close with a local title company on your timeline.'
    },
    {
      question: 'How fast can you close?',
      answer: 'Many closings happen in about 7 to 10 days, or later if you need more time.'
    },
    {
      question: 'Do I need to make repairs or clean up first?',
      answer: 'No. We buy houses as-is, even if they need repairs or clean-out.'
    },
    {
      question: 'Are there fees or commissions?',
      answer: 'No agent commissions. We explain any standard closing costs up front.'
    },
    {
      question: 'Can you help if I am behind on payments or facing foreclosure?',
      answer: 'Yes. Timing matters, so reach out early and we can review options for a fast sale.'
    }
  ];
  baseGraph.push(
    buildFaqSchema(faqItems, pageUrl),
    buildBreadcrumb([
      { name: 'Home', url: `${getBaseUrl()}/` },
      { name: 'FAQ', url: pageUrl }
    ])
  );
  res.render('faq', { title: `Frequently Asked Questions`, jsonLd: buildJsonLd(baseGraph) });
});
app.get('/property-finder', (req, res) => {
  res.render('propertyFinder', {
    title: 'Property Finder (Bird Dog) HQ',
    telegramLink: process.env.TELEGRAM_GROUP_URL || 'https://t.me/c/1888731494/1/9'
  });
});
app.get('/property-finder/agreement', (req, res) => {
  const defaultDate = new Date().toISOString().split('T')[0];
  res.render('propertyFinderContract', {
    title: 'Independent Contractor Agreement',
    telegramLink: process.env.TELEGRAM_GROUP_URL || 'https://t.me/c/1888731494/1/9',
    defaultAgreementDate: defaultDate
  });
});
app.get('/properties', async (req, res) => {
  // Support filter form query params: q, beds, baths, priceRange, proOnly
  const { q, beds, baths, priceRange, proOnly } = req.query || {};
  try {
    let pool = await sql.connect(dbConfig);

    // Build parameterized WHERE clauses
    const where = ['Available = 1'];
    const request = pool.request();

    if (q && String(q).trim() !== '') {
      where.push('(Title LIKE @q OR PropertyAddress LIKE @q OR Description LIKE @q)');
      request.input('q', sql.NVarChar, `%${String(q).trim()}%`);
    }

    if (beds && String(beds).trim() !== '') {
      // Expect formats like '1+' or numeric string. Treat 'N+' as >= N
      const m = String(beds).match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        where.push('Bedrooms >= @beds');
        request.input('beds', sql.Int, n);
      }
    }

    if (baths && String(baths).trim() !== '') {
      const m = String(baths).match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        where.push('Bathrooms >= @baths');
        request.input('baths', sql.Int, n);
      }
    }

    if (priceRange && String(priceRange).trim() !== '') {
      // Support a few ranges used in the UI
      const pr = String(priceRange).replace(/\s/g, '');
      if (/^\$?0-\$?100k$/i.test(pr) || /^\$?0-\$?100000$/i.test(pr)) {
        where.push('AskingPrice BETWEEN @pmin AND @pmax');
        request.input('pmin', sql.Money, 0);
        request.input('pmax', sql.Money, 100000);
      } else if (/100k-300k/i.test(pr) || /100000-300000/.test(pr)) {
        where.push('AskingPrice BETWEEN @pmin AND @pmax');
        request.input('pmin', sql.Money, 100000);
        request.input('pmax', sql.Money, 300000);
      } else if (/300k\+/i.test(pr) || /300000\+/.test(pr)) {
        where.push('AskingPrice >= @pmin');
        request.input('pmin', sql.Money, 300000);
      }
    }

    if (proOnly && (proOnly === 'on' || proOnly === 'true' || proOnly === '1')) {
      // assume a boolean/bit column named IsPro exists
      where.push('IsPro = 1');
    }

    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    // Show newest listings first (fallback to listingId for consistent ordering)
    const finalQuery = `SELECT * FROM dbo.listings_tbl ${whereSql} ORDER BY CreatedAt DESC, listingId DESC`;

    const result = await request.query(finalQuery);
    const listers = result.recordset || [];

    // Preserve query values for the view so form inputs keep their values
    res.render('properties', {
      title: `Available properties`,
      property: listers,
      filters: { q: q || '', beds: beds || '', baths: baths || '', priceRange: priceRange || '', proOnly: proOnly || '' }
    });
  } catch (err) {
    console.error('Error fetching lister with filters:', err);
    res.status(500).send('Error fetching lister');
  } finally {
    sql.close();
  }
});
app.get('/property/:id', async (req, res) => {
  const listingId = req.params.id;
  try {
      const list = await fetchlistPost(listingId);
      if (!list) {
          return res.status(404).send('List post not found');
      }
      res.render('property', { title: `property For Sale `, listPost:list });
      // res.render('blog', { layout: false , title: post.Title, postt: post });
    } catch (err) {
      res.status(500).send('Error retrieving list post');
  } finally {
    sql.close();
}
});
app.get('/Blogs', async (req, res) => {
  try {
    const blogPosts = await fetchBlogPosts();
    const sortedPosts = blogPosts
      .slice()
      .sort((a, b) => {
        const aTime = a.CreatedAt ? new Date(a.CreatedAt).getTime() : 0;
        const bTime = b.CreatedAt ? new Date(b.CreatedAt).getTime() : 0;
        return bTime - aTime;
      });
    const releaseBlogs = sortedPosts.slice(0, 6);
    const recommendBlogs = sortedPosts.slice(6, 12);
    const categoryMap = new Map();
    sortedPosts.forEach((post) => {
      const category = (post.Category || '').trim() || 'Uncategorized';
      if (!categoryMap.has(category)) categoryMap.set(category, []);
      categoryMap.get(category).push(post);
    });
    const categoryGroups = Array.from(categoryMap.entries()).map(([category, posts]) => ({
      category,
      posts,
    }));

    const baseGraph = buildBaseGraph(req);
    const pageUrl = getPageUrl(req);
    baseGraph.push(buildBreadcrumb([
      { name: 'Home', url: `${getBaseUrl()}/` },
      { name: 'Blog', url: pageUrl }
    ]));
    res.render('blogs', {
      layout: 'main',
      title: 'All Blog Posts',
      blogs: blogPosts,
      releaseBlogs,
      recommendBlogs,
      categoryGroups,
      jsonLd: buildJsonLd(baseGraph)
    });
  } catch (err) {
    res.status(500).send(err.message);
  } finally {
    sql.close();
}
});
app.get('/blog/:id', async (req, res) => {
  const postId = req.params.id;
  try {
      const post = await fetchBlogPost(postId);
      if (!post) {
          return res.status(404).send('Blog post not found');
      }
      const baseGraph = buildBaseGraph(req);
      const pageUrl = getPageUrl(req);
      const pageTitle = post.ArticleTitle || post.Title;
      baseGraph.push(
        buildBlogPostingSchema(post, postId),
        buildBreadcrumb([
          { name: 'Home', url: `${getBaseUrl()}/` },
          { name: 'Blog', url: `${getBaseUrl()}/blogs` },
          { name: pageTitle, url: pageUrl }
        ])
      );
      res.render('blog', { layout: false , title: pageTitle, postt: post, jsonLd: buildJsonLd(baseGraph) });
    } catch (err) {
      res.status(500).send('Error retrieving blog post');
  } finally {
    sql.close();
}
});
app.get('/signin', (req, res) => {
  const error = req.query.error;
  res.render('signin', { title: 'Sign In', layout: false, error });
});
// Render signup page
app.get('/signup', (req, res) => {
  res.render('signup', { title: 'Sign Up', layout: false });
});
app.get('/Contactus', (req, res) => {
  res.render('Contactus', { title: `Contact Us` });
});

// dashboard routes
app.get('/dashboard', authMiddleware, (req, res) => {
  res.render('dashboard', { title: ` dashboard `, layout: "__dashboard" });
});
app.get('/dashboard/profile', authMiddleware, (req, res) => {
  res.render('profile', { title: ` profile `, layout: "__dashboard" });
});
app.get('/dashboard/tables', authMiddleware, (req, res) => {
  res.render('dashTable', { title: ` Tables `, layout: "__dashboard" });
});
app.get('/dashboard/virtual-reality', authMiddleware, (req, res) => {
  res.render('vreality', { title: ` Virtual Reality `, layout: false });
});
app.get('/dashboard/billing', authMiddleware, (req, res) => {
  res.render('billing', { title: ` billing `, layout: "__dashboard" });
});
app.get('/dashboard/cashBuyers', authMiddleware, async (req, res) => {
  try {
    let pool = await sql.connect(dbConfig);
    let result = await pool.request().query('SELECT * FROM dbo.cashbuyers_tbl');
    const cashbuyers = result.recordset;
    res.render('cashCard', { title: 'CashBuyers', layout: "__dashboard", cashbuyer: cashbuyers });
  } catch (err) {
    console.error('Error fetching CashBuyers:', err);
    res.status(500).send('Error fetching CashBuyers');
  } finally {
    sql.close();
}
});

app.get('/dashboard/cashBuyers/:buyerID/edit', authMiddleware, async (req, res) => {
  const buyerID = Number.parseInt(req.params.buyerID, 10);
  if (!Number.isFinite(buyerID)) return res.status(400).send('Invalid buyerID');

  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('buyerID', sql.Int, buyerID)
      .query('SELECT TOP 1 * FROM dbo.cashbuyers_tbl WHERE buyerID = @buyerID');

    const buyer = (result.recordset || [])[0];
    if (!buyer) return res.status(404).send('Cash buyer not found');

    res.render('cashBuyerEdit', {
      title: 'Edit Cash Buyer',
      layout: '__dashboard',
      buyer,
      success: req.query.success,
      message: req.query.message
    });
  } catch (err) {
    console.error('Error loading Cash Buyer edit page:', err);
    res.status(500).send('Error loading Cash Buyer edit page');
  } finally {
    sql.close();
  }
});

app.post('/dashboard/cashBuyers/:buyerID/edit', authMiddleware, async (req, res) => {
  const buyerID = Number.parseInt(req.params.buyerID, 10);
  if (!Number.isFinite(buyerID)) return res.status(400).send('Invalid buyerID');

  const formData = req.body || {};
  const sanitized = {
    FullName: validator.escape(formData.FullName || ''),
    CompanyName: validator.escape(formData.CompanyName || ''),
    Website: validator.isURL(formData.Website || '', { require_protocol: false }) ? String(formData.Website) : '',
    CellPhone: validator.escape(formData.CellPhone || ''),
    Email: validator.normalizeEmail(formData.Email || '') || '',
    Address: validator.escape(formData.Address || ''),
    YearsInBusiness: validator.isInt(String(formData.YearsInBusiness || ''), { min: 0 }) ? Number.parseInt(formData.YearsInBusiness, 10) : null,
    CompletedProjects: validator.isInt(String(formData.CompletedProjects || ''), { min: 0 }) ? Number.parseInt(formData.CompletedProjects, 10) : null,
    CurrentProjects: validator.escape(formData.CurrentProjects || ''),
    PropertiesNext6Months: validator.isInt(String(formData.PropertiesNext6Months || ''), { min: 0 }) ? Number.parseInt(formData.PropertiesNext6Months, 10) : null,
    PropertiesPerYear: validator.isInt(String(formData.PropertiesPerYear || ''), { min: 0 }) ? Number.parseInt(formData.PropertiesPerYear, 10) : null,
    SourceFinancing: validator.escape(formData.SourceFinancing || ''),
    FundingInPlace: validator.escape(formData.FundingInPlace || ''),
    ProofOfFunds: validator.escape(formData.ProofOfFunds || ''),
    TripleDeals: validator.escape(formData.TripleDeals || ''),
    Quickly: validator.escape(formData.Quickly || ''),
    PriceRanges: validator.escape(formData.PriceRanges || ''),
    MinimumProfit: validator.escape(formData.MinimumProfit || ''),
    GoodDealCriteria: validator.escape(formData.GoodDealCriteria || ''),
    PreferredAreas: validator.escape(formData.PreferredAreas || ''),
    AvoidedAreas: validator.escape(formData.AvoidedAreas || ''),
    PropertyType: validator.escape(formData.PropertyType || ''),
    WorkType: validator.escape(formData.WorkType || ''),
    MaxPropertyAge: validator.isInt(String(formData.MaxPropertyAge || ''), { min: 0 }) ? Number.parseInt(formData.MaxPropertyAge, 10) : null,
    Mins: validator.escape(formData.Mins || ''),
    IdealProperty: validator.escape(formData.IdealProperty || ''),
    InvestmentStrategy: validator.escape(formData.InvestmentStrategy || ''),
    PurchaseReadiness: validator.isInt(String(formData.PurchaseReadiness || ''), { min: 0 }) ? Number.parseInt(formData.PurchaseReadiness, 10) : null,
    AdditionalComments: validator.escape(formData.AdditionalComments || '')
  };

  try {
    const pool = await sql.connect(dbConfig);
    const request = pool.request().input('buyerID', sql.Int, buyerID);

    const addInput = (name, type, value) => {
      request.input(name, type, value === undefined ? null : value);
    };

    // strings
    addInput('FullName', sql.NVarChar, sanitized.FullName);
    addInput('CompanyName', sql.NVarChar, sanitized.CompanyName);
    addInput('Website', sql.NVarChar, sanitized.Website);
    addInput('CellPhone', sql.NVarChar, sanitized.CellPhone);
    addInput('Email', sql.NVarChar, sanitized.Email);
    addInput('Address', sql.NVarChar, sanitized.Address);
    addInput('CurrentProjects', sql.NVarChar, sanitized.CurrentProjects);
    addInput('SourceFinancing', sql.NVarChar, sanitized.SourceFinancing);
    addInput('FundingInPlace', sql.NVarChar, sanitized.FundingInPlace);
    addInput('ProofOfFunds', sql.NVarChar, sanitized.ProofOfFunds);
    addInput('TripleDeals', sql.NVarChar, sanitized.TripleDeals);
    addInput('Quickly', sql.NVarChar, sanitized.Quickly);
    addInput('PriceRanges', sql.NVarChar, sanitized.PriceRanges);
    addInput('MinimumProfit', sql.NVarChar, sanitized.MinimumProfit);
    addInput('GoodDealCriteria', sql.NVarChar, sanitized.GoodDealCriteria);
    addInput('PreferredAreas', sql.NVarChar, sanitized.PreferredAreas);
    addInput('AvoidedAreas', sql.NVarChar, sanitized.AvoidedAreas);
    addInput('PropertyType', sql.NVarChar, sanitized.PropertyType);
    addInput('WorkType', sql.NVarChar, sanitized.WorkType);
    addInput('Mins', sql.NVarChar, sanitized.Mins);
    addInput('IdealProperty', sql.NVarChar, sanitized.IdealProperty);
    addInput('InvestmentStrategy', sql.NVarChar, sanitized.InvestmentStrategy);
    addInput('AdditionalComments', sql.NVarChar, sanitized.AdditionalComments);

    // ints
    addInput('YearsInBusiness', sql.Int, sanitized.YearsInBusiness);
    addInput('CompletedProjects', sql.Int, sanitized.CompletedProjects);
    addInput('PropertiesNext6Months', sql.Int, sanitized.PropertiesNext6Months);
    addInput('PropertiesPerYear', sql.Int, sanitized.PropertiesPerYear);
    addInput('MaxPropertyAge', sql.Int, sanitized.MaxPropertyAge);
    addInput('PurchaseReadiness', sql.Int, sanitized.PurchaseReadiness);

    const updateQuery = `
      UPDATE dbo.cashbuyers_tbl SET
        FullName = @FullName,
        CompanyName = @CompanyName,
        Website = @Website,
        CellPhone = @CellPhone,
        Email = @Email,
        Address = @Address,
        YearsInBusiness = @YearsInBusiness,
        CompletedProjects = @CompletedProjects,
        CurrentProjects = @CurrentProjects,
        PropertiesNext6Months = @PropertiesNext6Months,
        PropertiesPerYear = @PropertiesPerYear,
        SourceFinancing = @SourceFinancing,
        FundingInPlace = @FundingInPlace,
        ProofOfFunds = @ProofOfFunds,
        TripleDeals = @TripleDeals,
        Quickly = @Quickly,
        PriceRanges = @PriceRanges,
        MinimumProfit = @MinimumProfit,
        GoodDealCriteria = @GoodDealCriteria,
        PreferredAreas = @PreferredAreas,
        AvoidedAreas = @AvoidedAreas,
        PropertyType = @PropertyType,
        WorkType = @WorkType,
        MaxPropertyAge = @MaxPropertyAge,
        Mins = @Mins,
        IdealProperty = @IdealProperty,
        InvestmentStrategy = @InvestmentStrategy,
        PurchaseReadiness = @PurchaseReadiness,
        AdditionalComments = @AdditionalComments
      WHERE buyerID = @buyerID
    `;

    await request.query(updateQuery);
    const msg = encodeURIComponent('Cash buyer updated.');
    return res.redirect(`/dashboard/cashBuyers/${buyerID}/edit?success=true&message=${msg}`);
  } catch (err) {
    console.error('Error updating Cash Buyer:', err);
    return res.status(500).send('Error updating Cash Buyer');
  } finally {
    try { sql.close(); } catch (e) {}
  }
});
app.get('/dashboard/fastSeller', authMiddleware, async (req, res) => {
  try {
    let pool = await sql.connect(dbConfig);
    let result = await pool.request().query('SELECT * FROM dbo.fastsell_tbl');
    const fastSellers = result.recordset;
    res.render('fastSeller', { title: 'fastSeller', layout: "__dashboard", fastSeller: fastSellers });
  } catch (err) {
    console.error('Error fetching fastSeller:', err);
    res.status(500).send('Error fetching fastSeller');
  } finally {
    sql.close();
}
});
app.get('/dashboard/lister', authMiddleware, async (req, res) => {
  try {
    let pool = await sql.connect(dbConfig);
    let result = await pool.request()
      .query('SELECT * FROM dbo.listings_tbl ORDER BY CreatedAt DESC, listingId DESC');
    const listers = result.recordset;
    res.render('lister', { title: 'lister', layout: "__dashboard", listings: listers });
  } catch (err) {
    console.error('Error fetching lister:', err);
    res.status(500).send('Error fetching lister');
  } finally {
    sql.close();
}
});
app.get('/dashboard/blogEditor', authMiddleware, async (req, res) => {
  try {
    let pool = await sql.connect(dbConfig);
    let result = await pool.request()
    .query(`SELECT postId, Title, Description, Imag, Contents, SeoJsonLd, CreatedAt,
      Category, PrimaryKeyword, SecondaryKeywords, Slug, FeaturedImageIdea, FeaturedImageAltText,
      Tags, ArticleTitle, ArticleDescription, Content, Cta
      FROM dbo.BlogPosts_tbl`);
    const blogPosts = result.recordset;
    res.render('blogEditor', { layout: '__dashboard', title: ' Blog Editor', blogs: blogPosts });
  } catch (err) {
    console.error('Error fetching blog posts:', err);
    res.status(500).send('Error fetching blog posts');
  } finally {
    sql.close();
}
});
app.get('/dashboard/kanban', authMiddleware, async (req, res) => {
  try {
    let pool = await sql.connect(dbConfig);

    // Accept ?date=YYYY-MM-DD to filter entries by day. Default to today when not provided.
    const queryDate = req.query.date ? new Date(req.query.date) : new Date();
    // Normalize to YYYY-MM-DD string for SQL DATE parameter and for the date input value
    const yyyy = queryDate.getFullYear();
    const mm = String(queryDate.getMonth() + 1).padStart(2, '0');
    const dd = String(queryDate.getDate()).padStart(2, '0');
    const dateOnly = `${yyyy}-${mm}-${dd}`;

    // Use a parameterized query to fetch rows for this day (based on ChatDate column)
    const result = await pool.request()
      .input('date', sql.Date, dateOnly)
      .query('SELECT * FROM dbo.kanban_tbl WHERE CONVERT(date, ChatDate) = @date ORDER BY ChatDate DESC');

    const kanban = result.recordset || [];
    res.render('kanban', { title: 'Kanban Feature', layout: '__dashboard', kanban: kanban, selectedDate: dateOnly, entriesCount: kanban.length });
  } catch (err) {
    console.error('Error fetching entries:', err);
    res.status(500).send('Error fetching entries');
  } finally {
    sql.close();
  }
});
app.get('/dashboard/contacts', authMiddleware, async (req, res)=>{
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query('SELECT * FROM dbo.contacts_tbl');
    const contacts = result.recordset;
    res.render('dashboard/contacts', { title: `Contacts`, layout:'__dashboard',  contacts:contacts });
} catch (err) {
    console.error("Database Error:", err);
    res.status(500).send("Error retrieving contacts from database");
  } finally {
    sql.close();
}
})

app.get('/dashboard/property-finder', authMiddleware, async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const leadsTableCheck = await pool.request()
      .input('table', sql.NVarChar, 'birddog_leads')
      .query(`
        SELECT 1 AS ok
        FROM INFORMATION_SCHEMA.TABLES
        WHERE LOWER(TABLE_SCHEMA) = 'dbo'
          AND LOWER(TABLE_NAME) = LOWER(@table)
      `);
    const contractsTableCheck = await pool.request()
      .input('table', sql.NVarChar, 'birddog_contracts')
      .query(`
        SELECT 1 AS ok
        FROM INFORMATION_SCHEMA.TABLES
        WHERE LOWER(TABLE_SCHEMA) = 'dbo'
          AND LOWER(TABLE_NAME) = LOWER(@table)
      `);
    const leadsExists = !!(leadsTableCheck.recordset && leadsTableCheck.recordset.length);
    const contractsExists = !!(contractsTableCheck.recordset && contractsTableCheck.recordset.length);

    const leadsResult = leadsExists
      ? await pool.request().query('SELECT * FROM dbo.birddog_leads ORDER BY SubmitDate DESC')
      : { recordset: [] };
    const contractsResult = contractsExists
      ? await pool.request().query('SELECT * FROM dbo.birddog_contracts ORDER BY SubmitDate DESC')
      : { recordset: [] };

    res.render('dashboard/propertyFinder', {
      title: 'Property Finder Leads',
      layout: '__dashboard',
      leads: leadsResult.recordset || [],
      contracts: contractsResult.recordset || []
    });
  } catch (err) {
    console.error('Error fetching property finder leads:', err);
    res.status(500).send('Error fetching property finder leads');
  } finally {
    sql.close();
  }
});


// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
