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

const app = express();
const port = process.env.PORT;

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
    const propsResult = await pool.request().query('SELECT listingId, CreatedAt, UpdatedAt, Available FROM dbo.listings_tbl WHERE Available = 1');
    const properties = (propsResult.recordset || []).map(r => ({
      loc: `${base}/property/${r.listingId}`,
      lastmod: (r.UpdatedAt || r.CreatedAt) ? new Date(r.UpdatedAt || r.CreatedAt).toISOString() : now
    }));

    // Fetch blog posts
    const postsResult = await pool.request().query('SELECT postId, CreatedAt, UpdatedAt FROM dbo.BlogPosts_tbl');
    const posts = (postsResult.recordset || []).map(p => ({
      loc: `${base}/blog/${p.postId}`,
      lastmod: (p.UpdatedAt || p.CreatedAt) ? new Date(p.UpdatedAt || p.CreatedAt).toISOString() : now
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
// Keep this in sync with IIS/web.config (maxAllowedContentLength) to avoid 413 errors.
const bodyLimit = process.env.BODY_LIMIT || '500mb';
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
    return s;
  } catch(e) { return String(value); }
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
      .query('SELECT Title, Imag, Contents, Description FROM dbo.BlogPosts_tbl WHERE postId = @PostId');
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
    .query('SELECT postId, Title, Description, Imag, Contents, CreatedAt FROM dbo.BlogPosts_tbl');
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
    res.render('index', { title: `Nick House Buyer`, blogs: recentPosts })
} catch (err) {
    res.status(500).send(err.message);
} finally {
  sql.close();
}
});
app.get('/about', (req, res) => {
  res.render('about', { title: 'About Nick House Buyer' });
});
app.get('/faq', (req, res) => {
  res.render('faq', { title: `Frequently Asked Questions` });
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
    const finalQuery = `SELECT * FROM dbo.listings_tbl ${whereSql} ORDER BY CreatedAt DESC`;

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
    res.render('blogs', { layout: 'main', title: 'All Blog Posts', blogs: blogPosts });
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
      res.render('blog', { layout: false , title: post.Title, postt: post });
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
      .query('SELECT * FROM dbo.listings_tbl');
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
    .query('SELECT postId, Title, Description, Imag, Contents, CreatedAt FROM dbo.BlogPosts_tbl');
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


// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});


app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
