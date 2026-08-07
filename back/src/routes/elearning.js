import express from 'express';
import { db } from '../db/db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.rango === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
};

// Middleware to check if user is advisor or admin (clients are excluded from e-learning)
const requireAdvisorOrAdmin = (req, res, next) => {
  if (req.user && (req.user.rango === 'asesor' || req.user.rango === 'admin')) {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado. Este módulo es solo para asesores.' });
  }
};

// Helper: format quiz questions from JSON
const parseJsonField = (field) => {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch (e) {
      return [];
    }
  }
  return field || [];
};

// 1. GET /api/elearning/courses - Fetch all courses and their modules
router.get('/courses', authenticateToken, requireAdvisorOrAdmin, async (req, res) => {
  try {
    if (db.isFallback()) {
      const data = db.getFallbackData();
      const courses = data.elearning_courses.map(course => {
        const modules = data.elearning_modules
          .filter(m => m.curso_id === course.id)
          .sort((a, b) => a.orden - b.orden)
          .map(m => ({
            ...m,
            quiz_preguntas: parseJsonField(m.quiz_preguntas)
          }));
        return { ...course, modulos: modules };
      });
      return res.json(courses);
    } else {
      const coursesRes = await db.query('SELECT * FROM elearning_cursos ORDER BY id ASC');
      const modulesRes = await db.query('SELECT * FROM elearning_modulos ORDER BY curso_id ASC, orden ASC, id ASC');
      
      const courses = coursesRes.rows.map(course => {
        const modules = modulesRes.rows
          .filter(m => m.curso_id === course.id)
          .map(m => ({
            ...m,
            quiz_preguntas: parseJsonField(m.quiz_preguntas)
          }));
        return { ...course, modulos: modules };
      });
      return res.json(courses);
    }
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ error: 'Error del servidor al obtener los cursos.' });
  }
});

// 2. POST /api/elearning/courses - Create course (Admin only)
router.post('/courses', authenticateToken, requireAdmin, async (req, res) => {
  const { titulo, descripcion } = req.body;
  if (!titulo) return res.status(400).json({ error: 'El título del curso es obligatorio.' });

  try {
    if (db.isFallback()) {
      const data = db.getFallbackData();
      const newId = data.elearning_courses.length ? Math.max(...data.elearning_courses.map(c => c.id)) + 1 : 1;
      const newCourse = {
        id: newId,
        titulo,
        descripcion: descripcion || '',
        created_at: new Date().toISOString()
      };
      data.elearning_courses.push(newCourse);
      db.saveFallback();
      return res.status(201).json(newCourse);
    } else {
      const result = await db.query(
        'INSERT INTO elearning_cursos (titulo, descripcion) VALUES ($1, $2) RETURNING *',
        [titulo, descripcion || '']
      );
      return res.status(201).json(result.rows[0]);
    }
  } catch (err) {
    console.error('Error creating course:', err);
    res.status(500).json({ error: 'Error del servidor al crear el curso.' });
  }
});

// 3. PUT /api/elearning/courses/:id - Edit course (Admin only)
router.put('/courses/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { titulo, descripcion } = req.body;
  const courseId = parseInt(req.params.id);
  if (!titulo) return res.status(400).json({ error: 'El título del curso es obligatorio.' });

  try {
    if (db.isFallback()) {
      const data = db.getFallbackData();
      const index = data.elearning_courses.findIndex(c => c.id === courseId);
      if (index === -1) return res.status(404).json({ error: 'Curso no encontrado.' });
      
      data.elearning_courses[index] = {
        ...data.elearning_courses[index],
        titulo,
        descripcion: descripcion || ''
      };
      db.saveFallback();
      return res.json(data.elearning_courses[index]);
    } else {
      const result = await db.query(
        'UPDATE elearning_cursos SET titulo = $1, descripcion = $2 WHERE id = $3 RETURNING *',
        [titulo, descripcion || '', courseId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Curso no encontrado.' });
      return res.json(result.rows[0]);
    }
  } catch (err) {
    console.error('Error updating course:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar el curso.' });
  }
});

// 4. DELETE /api/elearning/courses/:id - Delete course (Admin only)
router.delete('/courses/:id', authenticateToken, requireAdmin, async (req, res) => {
  const courseId = parseInt(req.params.id);

  try {
    if (db.isFallback()) {
      const data = db.getFallbackData();
      const courseIndex = data.elearning_courses.findIndex(c => c.id === courseId);
      if (courseIndex === -1) return res.status(404).json({ error: 'Curso no encontrado.' });

      // Remove course
      data.elearning_courses.splice(courseIndex, 1);
      // Remove related modules
      data.elearning_modules = data.elearning_modules.filter(m => m.curso_id !== courseId);
      db.saveFallback();
      return res.json({ message: 'Curso y sus módulos eliminados con éxito.' });
    } else {
      const result = await db.query('DELETE FROM elearning_cursos WHERE id = $1 RETURNING *', [courseId]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Curso no encontrado.' });
      return res.json({ message: 'Curso eliminado con éxito.' });
    }
  } catch (err) {
    console.error('Error deleting course:', err);
    res.status(500).json({ error: 'Error del servidor al eliminar el curso.' });
  }
});

// 5. POST /api/elearning/courses/:courseId/modules - Add module to course (Admin only)
router.post('/courses/:courseId/modules', authenticateToken, requireAdmin, async (req, res) => {
  const courseId = parseInt(req.params.courseId);
  const { titulo, contenido, orden, quiz_preguntas } = req.body;

  if (!titulo || !contenido) {
    return res.status(400).json({ error: 'Título y contenido del módulo son requeridos.' });
  }

  const parsedQuestions = Array.isArray(quiz_preguntas) ? quiz_preguntas : [];

  try {
    if (db.isFallback()) {
      const data = db.getFallbackData();
      const courseExists = data.elearning_courses.some(c => c.id === courseId);
      if (!courseExists) return res.status(404).json({ error: 'Curso no encontrado.' });

      const newId = data.elearning_modules.length ? Math.max(...data.elearning_modules.map(m => m.id)) + 1 : 1;
      const newModule = {
        id: newId,
        curso_id: courseId,
        titulo,
        contenido,
        orden: orden ? parseInt(orden) : 1,
        quiz_preguntas: parsedQuestions,
        created_at: new Date().toISOString()
      };
      data.elearning_modules.push(newModule);
      db.saveFallback();
      return res.status(201).json(newModule);
    } else {
      // Check if course exists
      const courseCheck = await db.query('SELECT id FROM elearning_cursos WHERE id = $1', [courseId]);
      if (courseCheck.rows.length === 0) return res.status(404).json({ error: 'Curso no encontrado.' });

      const result = await db.query(
        'INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [courseId, titulo, contenido, orden ? parseInt(orden) : 1, JSON.stringify(parsedQuestions)]
      );
      return res.status(201).json(result.rows[0]);
    }
  } catch (err) {
    console.error('Error creating module:', err);
    res.status(500).json({ error: 'Error del servidor al crear el módulo.' });
  }
});

// 6. PUT /api/elearning/modules/:id - Edit module (Admin only)
router.put('/modules/:id', authenticateToken, requireAdmin, async (req, res) => {
  const moduleId = parseInt(req.params.id);
  const { titulo, contenido, orden, quiz_preguntas } = req.body;

  if (!titulo || !contenido) {
    return res.status(400).json({ error: 'Título y contenido del módulo son requeridos.' });
  }

  const parsedQuestions = Array.isArray(quiz_preguntas) ? quiz_preguntas : [];

  try {
    if (db.isFallback()) {
      const data = db.getFallbackData();
      const index = data.elearning_modules.findIndex(m => m.id === moduleId);
      if (index === -1) return res.status(404).json({ error: 'Módulo no encontrado.' });

      data.elearning_modules[index] = {
        ...data.elearning_modules[index],
        titulo,
        contenido,
        orden: orden ? parseInt(orden) : data.elearning_modules[index].orden,
        quiz_preguntas: parsedQuestions
      };
      db.saveFallback();
      return res.json(data.elearning_modules[index]);
    } else {
      const result = await db.query(
        'UPDATE elearning_modulos SET titulo = $1, contenido = $2, orden = $3, quiz_preguntas = $4 WHERE id = $5 RETURNING *',
        [titulo, contenido, orden ? parseInt(orden) : 1, JSON.stringify(parsedQuestions), moduleId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Módulo no encontrado.' });
      return res.json(result.rows[0]);
    }
  } catch (err) {
    console.error('Error updating module:', err);
    res.status(500).json({ error: 'Error del servidor al actualizar el módulo.' });
  }
});

// 7. DELETE /api/elearning/modules/:id - Delete module (Admin only)
router.delete('/modules/:id', authenticateToken, requireAdmin, async (req, res) => {
  const moduleId = parseInt(req.params.id);

  try {
    if (db.isFallback()) {
      const data = db.getFallbackData();
      const index = data.elearning_modules.findIndex(m => m.id === moduleId);
      if (index === -1) return res.status(404).json({ error: 'Módulo no encontrado.' });

      data.elearning_modules.splice(index, 1);
      // Clean up attempts for this module
      data.elearning_attempts = data.elearning_attempts.filter(a => a.modulo_id !== moduleId);
      db.saveFallback();
      return res.json({ message: 'Módulo eliminado con éxito.' });
    } else {
      const result = await db.query('DELETE FROM elearning_modulos WHERE id = $1 RETURNING *', [moduleId]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Módulo no encontrado.' });
      return res.json({ message: 'Módulo eliminado con éxito.' });
    }
  } catch (err) {
    console.error('Error deleting module:', err);
    res.status(500).json({ error: 'Error del servidor al eliminar el módulo.' });
  }
});

// 8. POST /api/elearning/modules/:moduleId/attempt - Submit quiz answers and score
router.post('/modules/:moduleId/attempt', authenticateToken, requireAdvisorOrAdmin, async (req, res) => {
  const moduleId = parseInt(req.params.moduleId);
  const { respuestas_usuario } = req.body; // e.g. [0, 1, 0] corresponding to selected option indexes

  if (!Array.isArray(respuestas_usuario)) {
    return res.status(400).json({ error: 'El formato de respuestas debe ser un arreglo de índices.' });
  }

  try {
    let moduleData = null;

    if (db.isFallback()) {
      const data = db.getFallbackData();
      moduleData = data.elearning_modules.find(m => m.id === moduleId);
    } else {
      const resMod = await db.query('SELECT * FROM elearning_modulos WHERE id = $1', [moduleId]);
      if (resMod.rows.length > 0) {
        moduleData = resMod.rows[0];
      }
    }

    if (!moduleData) {
      return res.status(404).json({ error: 'Módulo no encontrado.' });
    }

    const quizQuestions = parseJsonField(moduleData.quiz_preguntas);
    const totalQuestions = quizQuestions.length;

    if (totalQuestions === 0) {
      return res.status(400).json({ error: 'Este módulo no tiene preguntas evaluables.' });
    }

    // Evaluate answers
    let score = 0;
    const evaluatedAnswers = quizQuestions.map((q, idx) => {
      const userAnswerIndex = respuestas_usuario[idx] !== undefined ? parseInt(respuestas_usuario[idx]) : -1;
      const isCorrect = userAnswerIndex === q.correcta;
      if (isCorrect) score++;
      
      return {
        pregunta: q.pregunta,
        opciones: q.opciones,
        seleccionada: userAnswerIndex,
        correcta: q.correcta,
        es_correcta: isCorrect
      };
    });

    const percent = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
    const aprobado = percent >= 70; // 70% threshold

    if (db.isFallback()) {
      const data = db.getFallbackData();
      const newId = data.elearning_attempts.length ? Math.max(...data.elearning_attempts.map(a => a.id)) + 1 : 1;
      const newAttempt = {
        id: newId,
        usuario_id: req.user.id,
        modulo_id: moduleId,
        puntaje: score,
        total_preguntas: totalQuestions,
        aprobado,
        respuestas_usuario: evaluatedAnswers,
        created_at: new Date().toISOString()
      };
      data.elearning_attempts.push(newAttempt);
      db.saveFallback();
      return res.status(201).json(newAttempt);
    } else {
      const qInsert = `
        INSERT INTO elearning_intentos (usuario_id, modulo_id, puntaje, total_preguntas, aprobado, respuestas_usuario)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const result = await db.query(qInsert, [
        req.user.id,
        moduleId,
        score,
        totalQuestions,
        aprobado,
        JSON.stringify(evaluatedAnswers)
      ]);
      return res.status(201).json(result.rows[0]);
    }
  } catch (err) {
    console.error('Error saving attempt:', err);
    res.status(500).json({ error: 'Error del servidor al registrar el intento de evaluación.' });
  }
});

// 9. GET /api/elearning/progress - Fetch training stats & attempts
router.get('/progress', authenticateToken, requireAdvisorOrAdmin, async (req, res) => {
  try {
    if (db.isFallback()) {
      const data = db.getFallbackData();
      
      // Load user details map
      const usersMap = {};
      data.usuarios.forEach(u => {
        const dp = data.datos_personales.find(d => d.usuario_id === u.id);
        const name = dp ? `${dp.primer_nombre} ${dp.primer_apellido}` : 'Asesor sin Perfil';
        usersMap[u.id] = { correo: u.correo, nombre: name, rango: u.rango };
      });

      // Filter attempts based on role
      let attempts = [];
      if (req.user.rango === 'admin') {
        attempts = data.elearning_attempts;
      } else {
        attempts = data.elearning_attempts.filter(a => a.usuario_id === req.user.id);
      }

      // Map progress with full course/module info
      const formatted = attempts.map(att => {
        const userObj = usersMap[att.usuario_id] || { correo: 'N/A', nombre: 'Desconocido', rango: 'asesor' };
        const modulo = data.elearning_modules.find(m => m.id === att.modulo_id) || { titulo: 'Módulo Eliminado', curso_id: null };
        const curso = modulo.curso_id ? data.elearning_courses.find(c => c.id === modulo.curso_id) : null;
        
        return {
          id: att.id,
          usuario_id: att.usuario_id,
          correo: userObj.correo,
          nombre: userObj.nombre,
          rango: userObj.rango,
          modulo_id: att.modulo_id,
          modulo_titulo: modulo.titulo,
          curso_titulo: curso ? curso.titulo : 'Curso Eliminado',
          puntaje: att.puntaje,
          total_preguntas: att.total_preguntas,
          aprobado: att.aprobado,
          respuestas_usuario: parseJsonField(att.respuestas_usuario),
          created_at: att.created_at
        };
      }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return res.json(formatted);
    } else {
      let queryStr = `
        SELECT 
          att.id,
          att.usuario_id,
          u.correo,
          COALESCE(dp.primer_nombre || ' ' || dp.primer_apellido, 'Asesor sin Perfil') AS nombre,
          u.rango,
          att.modulo_id,
          m.titulo AS modulo_titulo,
          c.titulo AS curso_titulo,
          att.puntaje,
          att.total_preguntas,
          att.aprobado,
          att.respuestas_usuario,
          att.created_at
        FROM elearning_intentos att
        LEFT JOIN usuarios u ON att.usuario_id = u.id
        LEFT JOIN datos_personales dp ON u.id = dp.usuario_id
        LEFT JOIN elearning_modulos m ON att.modulo_id = m.id
        LEFT JOIN elearning_cursos c ON m.curso_id = c.id
      `;
      let params = [];
      
      if (req.user.rango !== 'admin') {
        queryStr += ' WHERE att.usuario_id = $1 ';
        params.push(req.user.id);
      }
      
      queryStr += ' ORDER BY att.created_at DESC ';
      
      const result = await db.query(queryStr, params);
      
      const formatted = result.rows.map(att => ({
        ...att,
        respuestas_usuario: parseJsonField(att.respuestas_usuario)
      }));

      return res.json(formatted);
    }
  } catch (err) {
    console.error('Error fetching progress:', err);
    res.status(500).json({ error: 'Error del servidor al obtener el progreso de e-learning.' });
  }
});

export default router;
