const express = require('express');
const multer = require('multer');
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const dbConfig = require('../config/db'); // Database connection utility



// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images/uploads'); // Specify the folder for image uploads
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const upload = multer({ storage });

// Helper: Delete file
const deleteFile = (filePath) => {
    fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting file:', err);
    });
};

const normalizeJsonLd = (value) => {
    if (value === undefined || value === null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const match = raw.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (match && match[1]) {
        return match[1].trim();
    }
    return raw;
};

// Route to add a new blog post
router.post('/add-blog', upload.single('imag'), async (req, res) => {
    const referrer = req.get('Referer');
    const { title, description, contents, seoTitle, seoDescription, seoJsonLd } = req.body;
    const imageFile = req.file ? `public/images/uploads/${req.file.filename}` : null;
    const normalizedJsonLd = normalizeJsonLd(seoJsonLd);
    try {
        const pool = await sql.connect(dbConfig);

        await pool.request()
            .input('Title', sql.NVarChar, title)
            .input('Description', sql.NVarChar, description)
            .input('Imag', sql.NVarChar, imageFile)
            .input('Contents', sql.NText, contents)
            .input('SeoTitle', sql.NVarChar(255), seoTitle || null)
            .input('SeoDescription', sql.NVarChar(500), seoDescription || null)
            .input('SeoJsonLd', sql.NVarChar(sql.MAX), normalizedJsonLd)
            .query(`
                INSERT INTO dbo.BlogPosts_tbl (Title, Description, Imag, Contents, SeoTitle, SeoDescription, SeoJsonLd, CreatedAt)
                VALUES (@Title, @Description, @Imag, @Contents, @SeoTitle, @SeoDescription, @SeoJsonLd, GETDATE())
            `); 
    
        return res.redirect(`${referrer}?success=Blog+post+added+successfully`);
    } catch (err) {
        console.error('Error updating blog post:', err);
        return res.redirect(`${referrer}?error=Error+adding+blog+post`);
    } finally {
        sql.close();
      }
});



// Route to delete a blog post by ID
router.post('/delete-blog/:id', async (req, res) => {
    const { id } = req.params;
    const referrer = req.get('Referer') || '/dashboard/blogEditor'; // fallback to your blog editor page

    try {
        const pool = await sql.connect(dbConfig);

        // Get the image file path before deleting the post
        const post = await pool.request()
            .input('PostId', sql.Int, id)
            .query('SELECT Imag FROM dbo.BlogPosts_tbl WHERE postId = @PostId');

        if (post.recordset.length === 0) {
            return res.redirect(`${referrer}?error=Blog+post+not+found`);
        }

        const imagePath = post.recordset[0].Imag;
        if (imagePath) {
            deleteFile(path.join(__dirname, '..', imagePath));
        }

        // Delete the blog post
        await pool.request()
            .input('PostId', sql.Int, id)
            .query('DELETE FROM dbo.BlogPosts_tbl WHERE postId = @PostId');

        return res.redirect(`${referrer}?success=Blog+post+deleted+successfully`);
    } catch (err) {
        console.error('Error deleting blog post:', err);
        return res.redirect(`${referrer}?error=Error+deleting+blog+post`);
    } finally {
        sql.close();
    }
});

// Route to edit a blog post
router.post('/edit-blog/:id', upload.single('imag'), async (req, res) => {
    const { id } = req.params; // Post ID
    const { title, description, contents, seoTitle, seoDescription, seoJsonLd } = req.body;
    const imageFile = req.file ? `public/images/uploads/${req.file.filename}` : null;
    const referer = req.get('Referer') || '/'; // Default to home page if no referrer
    const normalizedJsonLd = normalizeJsonLd(seoJsonLd);
    
    try {
        const pool = await sql.connect(dbConfig);

        // Check if the post exists
        const existingPost = await pool.request()
            .input('PostId', sql.Int, id)
            .query('SELECT Imag FROM dbo.BlogPosts_tbl WHERE postId = @PostId');

        if (existingPost.recordset.length === 0) {
            return res.status(404).json({ message: 'Blog post not found' });
        }

        // Delete old image if a new one is uploaded
        const oldImagePath = existingPost.recordset[0].Imag;
        if (oldImagePath && imageFile) {
            try {
                deleteFile(path.join(__dirname, '..', oldImagePath));
            } catch (err) {
                console.error('Error deleting old image:', err);
            }
        }

        // Construct the query based on whether a new image is provided
        const query = imageFile
            ? `
                UPDATE dbo.BlogPosts_tbl
                SET Title = @Title,
                    Description = @Description,
                    Imag = @Imag,
                    Contents = @Contents,
                    SeoTitle = @SeoTitle,
                    SeoDescription = @SeoDescription,
                    SeoJsonLd = @SeoJsonLd,
                    CreatedAt = GETDATE()
                WHERE postId = @PostId
            `
            : `
                UPDATE dbo.BlogPosts_tbl
                SET Title = @Title,
                    Description = @Description,
                    Contents = @Contents,
                    SeoTitle = @SeoTitle,
                    SeoDescription = @SeoDescription,
                    SeoJsonLd = @SeoJsonLd,
                    CreatedAt = GETDATE()
                WHERE postId = @PostId
            `;

        // Prepare the SQL request
        const request = pool.request()
            .input('Title', sql.NVarChar, title)
            .input('Description', sql.NVarChar, description)
            .input('Contents', sql.NText, contents)
            .input('SeoTitle', sql.NVarChar(255), seoTitle || null)
            .input('SeoDescription', sql.NVarChar(500), seoDescription || null)
            .input('SeoJsonLd', sql.NVarChar(sql.MAX), normalizedJsonLd)
            .input('PostId', sql.Int, id);

        // Add image if uploaded
        if (imageFile) {
            request.input('Imag', sql.NVarChar, imageFile);
        }

        // Execute the query
        await request.query(query);

        // Redirect back with success message
        return res.redirect(`${referer}?success=Blog+post+updated+successfully`);
    } catch (err) {
        console.error('Error updating blog post:', err);
        return res.redirect(`${referer}?error=Error+updating+blog+post`);
    } finally {
        sql.close();
      }
});


module.exports = router;
