// create_ideas_tables.js
require('dotenv').config();
const { sql, connectToDatabase } = require('./config/database');

async function runMigration() {
  try {
    await connectToDatabase();
    console.log('Verbonden met database. Aanmaken van ideas tabellen...');

    const createQuery = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ideas')
      BEGIN
        CREATE TABLE ideas (
          id NVARCHAR(36) NOT NULL PRIMARY KEY,
          title NVARCHAR(MAX) NOT NULL,
          description NVARCHAR(MAX),
          category NVARCHAR(255),
          status NVARCHAR(100) DEFAULT 'proposed',
          created_by INT,
          created_at DATETIME DEFAULT GETDATE(),
          planned_date NVARCHAR(50),
          FOREIGN KEY (created_by) REFERENCES PF_Users(id) ON DELETE SET NULL
        );
        PRINT 'Tabel ideas aangemaakt.';
      END

      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'idea_likes')
      BEGIN
        CREATE TABLE idea_likes (
          idea_id NVARCHAR(36) NOT NULL,
          user_id INT NOT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          PRIMARY KEY (idea_id, user_id),
          FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES PF_Users(id) ON DELETE CASCADE
        );
        PRINT 'Tabel idea_likes aangemaakt.';
      END
    `;

    await sql.query(createQuery);
    console.log('Migratie ideas succesvol uitgevoerd!');
    process.exit(0);
  } catch (err) {
    console.error('Migratie mislukt:', err);
    process.exit(1);
  }
}

runMigration();
