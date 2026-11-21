// controllers/ideasController.js
const { sql } = require('../config/database');
const crypto = require('crypto');
const { isAdminUser } = require('../middleware/authMiddleware');

const getIdeas = async (req, res) => {
    try {
        const userId = Number(req.user?.userID || req.user?.id || req.query.userId || 0);

        const request = new sql.Request();
        request.input('userId', sql.Int, userId);
        
        const result = await request.query(`
            SELECT 
                i.*,
                u.username AS creator_name,
                (SELECT COUNT(*) FROM idea_likes WHERE idea_id = i.id) AS likes_count,
                (SELECT COUNT(*) FROM idea_likes WHERE idea_id = i.id AND user_id = @userId) AS has_liked
            FROM ideas i
            LEFT JOIN PF_Users u ON i.created_by = u.id
            ORDER BY 
                CASE i.status 
                    WHEN 'in_progress' THEN 1
                    WHEN 'planned' THEN 2
                    WHEN 'proposed' THEN 3
                    WHEN 'pending' THEN 4
                    WHEN 'completed' THEN 5
                    WHEN 'rejected' THEN 6
                    ELSE 7
                END ASC,
                CASE WHEN i.status IN ('planned', 'in_progress') AND i.planned_date IS NOT NULL THEN i.planned_date ELSE '9999-99-99' END ASC,
                (SELECT COUNT(*) FROM idea_likes WHERE idea_id = i.id) DESC,
                i.created_at DESC
        `);
        res.status(200).json(result.recordset || []);
    } catch (err) {
        console.error('Fout bij het ophalen van ideeën:', err);
        res.status(500).json({ error: 'Kon de ideeënlijst niet ophalen.' });
    }
};

const createIdea = async (req, res) => {
    try {
        const { title, description, category } = req.body;
        const userId = Number(req.user?.userID || req.user?.id || req.body.userId || 0) || null;
        const isAdmin = isAdminUser(req);

        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Titel is een verplicht veld.' });
        }

        const initialStatus = isAdmin ? 'proposed' : 'pending';
        const ideaId = crypto.randomUUID();

        const request = new sql.Request();
        request.input('id', sql.NVarChar, ideaId);
        request.input('title', sql.NVarChar, title.trim());
        request.input('description', sql.NVarChar, description ? description.trim() : null);
        request.input('category', sql.NVarChar, category || 'Algemeen');
        request.input('status', sql.NVarChar, initialStatus);
        request.input('created_by', sql.Int, userId);

        await request.query(`
            INSERT INTO ideas (id, title, description, category, status, created_by, created_at)
            VALUES (@id, @title, @description, @category, @status, @created_by, GETDATE())
        `);

        const selectReq = new sql.Request();
        selectReq.input('id', sql.NVarChar, ideaId);
        const newIdeaResult = await selectReq.query(`
            SELECT 
                i.*,
                u.username AS creator_name,
                0 AS likes_count,
                0 AS has_liked
            FROM ideas i
            LEFT JOIN PF_Users u ON i.created_by = u.id
            WHERE i.id = @id
        `);

        res.status(201).json(newIdeaResult.recordset[0]);
    } catch (err) {
        console.error('Fout bij het aanmaken van idee:', err);
        res.status(500).json({ error: 'Kon het idee niet opslaan.' });
    }
};

const toggleLike = async (req, res) => {
    try {
        const userId = Number(req.user?.userID || req.user?.id || req.body.userId || 0);
        const ideaId = req.params.id;

        if (!userId) {
            return res.status(401).json({ error: 'Niet ingelogd.' });
        }

        const checkIdeaReq = new sql.Request();
        checkIdeaReq.input('ideaId', sql.NVarChar, ideaId);
        const ideaCheck = await checkIdeaReq.query('SELECT 1 AS exists_flag FROM ideas WHERE id = @ideaId');
        if (ideaCheck.recordset.length === 0) {
            return res.status(404).json({ error: 'Idee niet gevonden.' });
        }

        const checkLikeReq = new sql.Request();
        checkLikeReq.input('idea_id', sql.NVarChar, ideaId);
        checkLikeReq.input('user_id', sql.Int, userId);
        const likeCheck = await checkLikeReq.query('SELECT 1 AS exists_flag FROM idea_likes WHERE idea_id = @idea_id AND user_id = @user_id');

        if (likeCheck.recordset.length > 0) {
            const delReq = new sql.Request();
            delReq.input('idea_id', sql.NVarChar, ideaId);
            delReq.input('user_id', sql.Int, userId);
            await delReq.query('DELETE FROM idea_likes WHERE idea_id = @idea_id AND user_id = @user_id');
        } else {
            const insReq = new sql.Request();
            insReq.input('idea_id', sql.NVarChar, ideaId);
            insReq.input('user_id', sql.Int, userId);
            await insReq.query('INSERT INTO idea_likes (idea_id, user_id, created_at) VALUES (@idea_id, @user_id, GETDATE())');
        }

        const statsReq = new sql.Request();
        statsReq.input('ideaId', sql.NVarChar, ideaId);
        statsReq.input('userId', sql.Int, userId);
        const statsResult = await statsReq.query(`
            SELECT 
                (SELECT COUNT(*) FROM idea_likes WHERE idea_id = @ideaId) AS likes_count,
                (SELECT COUNT(*) FROM idea_likes WHERE idea_id = @ideaId AND user_id = @userId) AS has_liked
        `);

        res.status(200).json({
            ideaId,
            likes_count: statsResult.recordset[0]?.likes_count || 0,
            has_liked: statsResult.recordset[0]?.has_liked || 0
        });
    } catch (err) {
        console.error('Fout bij het togglen van de stem:', err);
        res.status(500).json({ error: 'Kon stem niet verwerken.' });
    }
};

const updateIdeaStatus = async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { status } = req.body;
        const isAdmin = isAdminUser(req);

        if (!isAdmin) {
            return res.status(403).json({ error: 'Alleen beheerders kunnen de status van een idee wijzigen.' });
        }

        const allowedStatuses = ['proposed', 'planned', 'in_progress', 'completed', 'rejected', 'pending'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Ongeldige status opgegeven.' });
        }

        const request = new sql.Request();
        request.input('status', sql.NVarChar, status);
        request.input('id', sql.NVarChar, ideaId);
        const result = await request.query('UPDATE ideas SET status = @status WHERE id = @id');
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Idee niet gevonden.' });
        }

        res.status(200).json({ message: 'Status succesvol bijgewerkt.', ideaId, status });
    } catch (err) {
        console.error('Fout bij het updaten van de status:', err);
        res.status(500).json({ error: 'Kon de status niet bijwerken.' });
    }
};

const updateIdea = async (req, res) => {
    try {
        const ideaId = req.params.id;
        const { title, description, category, planned_date } = req.body;
        const userId = Number(req.user?.userID || req.user?.id || 0);
        const isAdmin = isAdminUser(req);

        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Titel is verplicht.' });
        }

        const checkReq = new sql.Request();
        checkReq.input('id', sql.NVarChar, ideaId);
        const checkResult = await checkReq.query('SELECT created_by FROM ideas WHERE id = @id');
        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Idee niet gevonden.' });
        }

        const idea = checkResult.recordset[0];
        if (!isAdmin && Number(idea.created_by) !== userId) {
            return res.status(403).json({ error: 'Niet gemachtigd om dit idee te bewerken.' });
        }

        const request = new sql.Request();
        request.input('title', sql.NVarChar, title.trim());
        request.input('description', sql.NVarChar, description ? description.trim() : null);
        request.input('category', sql.NVarChar, category || 'Algemeen');
        request.input('planned_date', sql.NVarChar, planned_date || null);
        request.input('id', sql.NVarChar, ideaId);
        const result = await request.query(
            'UPDATE ideas SET title = @title, description = @description, category = @category, planned_date = @planned_date WHERE id = @id'
        );

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Idee niet gevonden.' });
        }

        res.status(200).json({ message: 'Idee bijgewerkt.', ideaId, title, description, category, planned_date });
    } catch (err) {
        console.error('Fout bij het bijwerken van idee:', err);
        res.status(500).json({ error: 'Kon het idee niet bijwerken.' });
    }
};

const deleteIdea = async (req, res) => {
    try {
        const userId = Number(req.user?.userID || req.user?.id || 0);
        const isAdmin = isAdminUser(req);
        const ideaId = req.params.id;

        const getIdeaReq = new sql.Request();
        getIdeaReq.input('id', sql.NVarChar, ideaId);
        const ideaResult = await getIdeaReq.query('SELECT created_by FROM ideas WHERE id = @id');
        if (ideaResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Idee niet gevonden.' });
        }

        const idea = ideaResult.recordset[0];
        if (!isAdmin && Number(idea.created_by) !== userId) {
            return res.status(403).json({ error: 'Niet gemachtigd om dit idee te verwijderen.' });
        }

        const delReq = new sql.Request();
        delReq.input('id', sql.NVarChar, ideaId);
        await delReq.query('DELETE FROM ideas WHERE id = @id');
        res.status(200).json({ message: 'Idee succesvol verwijderd.', ideaId });
    } catch (err) {
        console.error('Fout bij het verwijderen van idee:', err);
        res.status(500).json({ error: 'Kon het idee niet verwijderen.' });
    }
};

module.exports = {
    getIdeas,
    createIdea,
    toggleLike,
    updateIdeaStatus,
    updateIdea,
    deleteIdea
};
