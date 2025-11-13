const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ dest: 'uploads/' });

require('dotenv').config(); // Cargar las variables de entorno
const port = process.env.PORT || 3000; // Puerto desde .env o valor por defecto

// Configuración de la sesión
app.use(session({
  secret: 'secretKey',
  resave: false,
  saveUninitialized: false,
}));

app.use(express.urlencoded({ extended: true }));


// Configurar conexión a MySQL
const connection = mysql.createConnection({
  host: process.env.DB_HOST,       // Host desde .env
  user: process.env.DB_USER,       // Usuario desde .env
  password: process.env.DB_PASS,   // Contraseña desde .env
  database: process.env.DB_NAME    // Nombre de la base de datos desde .env
  
});

// Conectar a la base de datos
connection.connect(err => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err);
    return;
  }
  console.log('Conexión exitosa a la base de datos');
});


function requireLogin(req, res, next) {
 
  if (!req.session.user) {
    return res.redirect('/login.html');
  }
  next();
}
/////////////////////////////////////////////////////////////////////////////////////////////
function requireRole(role) {
    
    return (req, res, next) => {
      
        if (req.session.user && role.includes(req.session.user.tipo_usuario)) {  
          
          next();
            
        } else {
            res.status(403).send('Acceso denegado, requeireRole');
            console.log(role);
            
        }
    };
}


app.get('/menu', (req, res) => {
  const menuItems = [
    { nombre: 'Inicio', url: '/index.html' },
    { nombre: 'Equipos', url: '/equipos.html' },
    { nombre: 'Usuarios', url: '/usuarios.html' },
    { nombre: 'Búsqueda', url: '/busqueda.html' }
  ];
  res.json(menuItems);
});

// Ruta protegida (Página principal después de iniciar sesión)
app.get('/', requireLogin, (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Registro de usuario
app.post('/registro', (req, res) => {
    const { username, password, codigo_acceso } = req.body;

    const query = 'SELECT tipo_usuario FROM codigos_acceso WHERE codigo = ?';
    connection.query(query, [codigo_acceso], (err, results) => {
        if (err || results.length === 0) {
            return res.send('Código de acceso inválido');
        }

        const tipo_usuario = results[0].tipo_usuario;
        const hashedPassword = bcrypt.hashSync(password, 10);

        const insertUser = 'INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuario) VALUES (?, ?, ?)';
        connection.query(insertUser, [username, hashedPassword, tipo_usuario], (err) => {
            if (err) return res.send('Error al registrar usuario2');
            res.redirect('/login.html');
        });
    });
});


// Iniciar sesión


app.post('/login', (req, res) => {
    const { nombre_usuario, password } = req.body;
    console.log(req.body);
    console.log(nombre_usuario,password);
    // Consulta para obtener el usuario y su tipo
    connection.query('SELECT * FROM usuarios WHERE nombre_usuario = ?', 
    [nombre_usuario], async (err, results) => {
        if (err) {
            return res.send('Error al obtener el usuario');
        }

        if (results.length === 0) {
            return res.send('Usuario no encontrado');
        }

        const user = results[0];

        // Verificar la contraseña
        const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
        if (!isPasswordValid) {
            return res.send('Contraseña incorrecta');
        }

        // Almacenar la información del usuario en la sesión
        //req.session.userId = user.id;
        req.session.user = {
            id: user.id,
            username: user.nombre_usuario,
            tipo_usuario: user.tipo_usuario // Aquí se establece el tipo de usuario en la sesión
        };
        console.log("hhloa");
        // Redirigir al usuario a la página principal
        res.redirect('/');
    });
});



// Cerrar sesión
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});

// Ruta para obtener el tipo de usuario actual
app.get('/tipo-usuario', requireLogin, (req, res) => {
    res.json({ tipo_usuario: req.session.user.tipo_usuario });
});

// Servir archivos estáticos (HTML)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/buscar', (req, res) => {
  const query = req.query.query;
  const sql = `SELECT nombre  FROM pacientes WHERE nombre LIKE ?`;
  connection.query(sql, [`%${query}%`], (err, results) => {
    if (err) throw err;
    res.json(results);
  });
});

app.post('/upload', upload.single('excelFile'), (req, res) => {
  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  data.forEach(row => {
    const { nombre, descripcion } = row;
    const sql = `INSERT INTO equipos (nombre, descripcion) VALUES (?, ?)`;
    db.query(sql, [nombre, descripcion], err => {
      if (err) throw err;
    });
  });

  res.send('<h1>Archivo cargado y datos guardados</h1><a href="/equipos.html">Volver</a>');
});

app.get('/download', (req, res) => {
  const sql = `SELECT * FROM equipos`;
  connection.query(sql, (err, results) => {
    if (err) throw err;

    const worksheet = xlsx.utils.json_to_sheet(results);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Equipos');

    const filePath = path.join(__dirname, 'uploads', 'equipos.xlsx');
    xlsx.writeFile(workbook, filePath);
    res.download(filePath, 'equipos.xlsx');
  });
});

// Ruta para mostrar los datos de la base de datos en formato HTML
app.get('/pacientes',requireLogin,requireRole('medico'), (req, res) => {
  connection.query('SELECT * FROM pacientes', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <body>
        <h1>Pacientes Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Frecuencia Cardiaca (bpm)</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(paciente => {
      html += `
        <tr>
          <td>${paciente.nombre}</td>
          <td>${paciente.edad}</td>
          <td>${paciente.frecuencia_cardiaca}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});


app.get('/mostrar_medicos',requireLogin,requireRole('admin'), (req, res) => {
  connection.query('SELECT * FROM medicos', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Medicos</title>
      </head>
      <body>
        <h1>Medicos Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Especialidad</th>
              
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(medico => {
      html += `
        <tr>
          <td>${medico.nombre}</td>
          <td>${medico.especialidad}</td>
          
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});



// Ruta para guardar datos en la base de datos
app.post('/submit-data',requireLogin,requireRole('medico'), (req, res) => {
  const { name, age, heart_rate } = req.body;
    //console.log(req.body);
  const query = 'INSERT INTO pacientes (nombre, edad, frecuencia_cardiaca) VALUES (?, ?, ?)';
  connection.query(query, [name, age, heart_rate], (err, result) => {
    if (err) {
      let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <h1> Error al guardar paciente</h1>
         
      </head>
        <button onclick="window.location.href='/'">Volver</button>
      </html>
    `;

    return res.send(html);
    }
    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <h1> Paciente Guardado</h1>
         
      </head>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});





// Otras rutas protegidas
app.get('/buscar-pacientes', requireLogin, (req, res) => {
  const { name_search, age_search } = req.query;
  let query = 'SELECT * FROM pacientes WHERE 1=1';

  if (name_search) {
    query += ` AND nombre LIKE '%${name_search}%'`;
  }
  if (age_search) {
    query += ` AND edad = ${age_search}`;
  }

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Resultados de Búsqueda</title>
      </head>
      <body>
        <h1>Resultados de Búsqueda</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Frecuencia Cardiaca (bpm)</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(paciente => {
      html += `
        <tr>
          <td>${paciente.nombre}</td>
          <td>${paciente.edad}</td>
          <td>${paciente.frecuencia_cardiaca}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

app.get('/ordenar-pacientes', requireLogin,requireRole(['medico','admin']), (req, res) => {
  const query = 'SELECT * FROM pacientes ORDER BY frecuencia_cardiaca DESC';
  
  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes Ordenados</title>
      </head>
      <body>
        <h1>Pacientes Ordenados por Frecuencia Cardiaca</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Frecuencia Cardiaca (bpm)</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(paciente => {
      html += `
        <tr>
          <td>${paciente.nombre}</td>
          <td>${paciente.edad}</td>
          <td>${paciente.frecuencia_cardiaca}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

app.post('/insertar-medico', requireLogin,requireRole('admin'), (req, res) => {
  // lógica de inserción de médicos
   const { name, especialidad } = req.body;
  const query = 'INSERT INTO medicos (nombre, especialidad) VALUES (?, ?)';

  connection.query(query, [name, especialidad], (err, result) => {
    if (err) {
      let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <h1> Error al guardar Medico</h1>
         
      </head>
        <button onclick="window.location.href='/'">Volver</button>
      </html>
    `;
      return res.send(html);
    }
    if (name=="" || especialidad==""){
      let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>medicos</title>
      </head>
      <h1> Error al guardar Medico</h1>
         
      </head>
        <button onclick="window.location.href='/'">Volver</button>
      </html>
    `;
      return res.send(html);
    }
     let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <h1> Medico Guardado</h1>
         
      </head>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;
    res.send(html);
  });
});



// Iniciar el servidor
app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
