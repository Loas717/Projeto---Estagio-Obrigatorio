'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('Institutions', {
        id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
        },
        name: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
        },
        createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        });

/*         await queryInterface.addColumn('Users', 'institutionId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
            model: 'Institutions',
            key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        }); */

        await queryInterface.createTable('InstitutionStudents', {
        id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
        },
        institutionId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
            model: 'Institutions',
            key: 'id',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        studentId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
            model: 'Users',
            key: 'id',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
        createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        });

        await queryInterface.addIndex('InstitutionStudents', ['institutionId', 'studentId'], {
        unique: true,
        name: 'institution_students_unique_idx',
        });

        const users = await queryInterface.sequelize.query(
        'SELECT id, "institutionName", role FROM "Users" WHERE "institutionName" IS NOT NULL',
        { type: Sequelize.QueryTypes.SELECT }
        );

        for (const user of users) {
        if (user.role === 'instituicao') {
            const [institutionRecord] = await queryInterface.sequelize.query(
            'INSERT INTO "Institutions" (name, "createdAt", "updatedAt") VALUES (:name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id, name',
            {
                replacements: { name: user.institutionName },
                type: Sequelize.QueryTypes.INSERT,
            }
            );

            const institutionId = institutionRecord?.id ?? (
            await queryInterface.sequelize.query(
                'SELECT id FROM "Institutions" WHERE name = :name LIMIT 1',
                {
                replacements: { name: user.institutionName },
                type: Sequelize.QueryTypes.SELECT,
                }
            )
            )[0]?.id;

            if (institutionId) {
            await queryInterface.sequelize.query(
                'UPDATE "Users" SET "institutionId" = :institutionId WHERE id = :userId',
                {
                replacements: { institutionId, userId: user.id },
                }
            );
            }
        }

        if (user.role === 'aluno') {
            const institutionId = (
            await queryInterface.sequelize.query(
                'SELECT id FROM "Institutions" WHERE name = :name LIMIT 1',
                {
                replacements: { name: user.institutionName },
                type: Sequelize.QueryTypes.SELECT,
                }
            )
            )[0]?.id;

            if (institutionId) {
            await queryInterface.sequelize.query(
                'INSERT INTO "InstitutionStudents" ("institutionId", "studentId", "createdAt", "updatedAt") VALUES (:institutionId, :studentId, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("institutionId", "studentId") DO NOTHING',
                {
                replacements: {
                    institutionId,
                    studentId: user.id,
                },
                }
            );
            }
        }
        }

        await queryInterface.removeColumn('Users', 'institutionName');
    },

    async down(queryInterface, Sequelize) {
        const institutionLinks = await queryInterface.sequelize.query(
        'SELECT "institutionId", "studentId" FROM "InstitutionStudents"',
        { type: Sequelize.QueryTypes.SELECT }
        );

        await queryInterface.addColumn('Users', 'institutionName', {
        type: Sequelize.STRING,
        allowNull: true,
        });

        for (const link of institutionLinks) {
        const institution = await queryInterface.sequelize.query(
            'SELECT name FROM "Institutions" WHERE id = :institutionId LIMIT 1',
            {
            replacements: { institutionId: link.institutionId },
            type: Sequelize.QueryTypes.SELECT,
            }
        );

        if (institution[0]?.name) {
            await queryInterface.sequelize.query(
            'UPDATE "Users" SET "institutionName" = :institutionName WHERE id = :studentId',
            {
                replacements: {
                institutionName: institution[0].name,
                studentId: link.studentId,
                },
            }
            );
        }
        }

        await queryInterface.dropTable('InstitutionStudents');
        await queryInterface.dropTable('Institutions');
        await queryInterface.removeColumn('Users', 'institutionId');
    },
};
