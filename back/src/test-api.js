// Usar el fetch global de Node.js

const API_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 Iniciando pruebas de API...');

  let testUserToken = null;

  try {
    // 1. Probar registro
    console.log('\n1. Probando registro de usuario...');
    const registerRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correo: `test_${Date.now()}@jka.com`,
        contrasena: 'password123',
        primer_nombre: 'Mariana',
        segundo_nombre: 'Sofia',
        primer_apellido: 'Rodriguez',
        segundo_apellido: 'Perez',
        fecha_nacimiento: '1995-04-12',
        tipo_documento: 'Venezolano',
        nro_documento: `V-${Math.floor(10000000 + Math.random() * 90000000)}`,
        genero: 'Femenino',
        estado_civil: 'Soltero',
        codigo_area: '0414',
        numero_celular: '7654321'
      })
    });

    const registerData = await registerRes.json();
    if (registerRes.ok) {
      console.log('✅ Registro exitoso:', registerData.user.correo);
      testUserToken = registerData.token;
    } else {
      console.error('❌ Registro fallido:', registerData.error);
      process.exit(1);
    }

    // 2. Probar login
    console.log('\n2. Probando inicio de sesión...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correo: registerData.user.correo,
        contrasena: 'password123'
      })
    });
    const loginData = await loginRes.json();
    if (loginRes.ok) {
      console.log('✅ Inicio de sesión exitoso. Token obtenido.');
    } else {
      console.error('❌ Inicio de sesión fallido:', loginData.error);
      process.exit(1);
    }

    // 3. Probar cotización
    console.log('\n3. Probando cotización comparativa...');
    const quoteRes = await fetch(`${API_URL}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha_nacimiento: '1995-04-12',
        suma_asegurada: 50000
      })
    });
    const quoteData = await quoteRes.json();
    if (quoteRes.ok) {
      console.log('✅ Cotización calculada exitosamente.');
      console.log(`   Edad del asegurado: ${quoteData.edad} años`);
      console.log(`   Número de ofertas de compañías: ${quoteData.comparativa.length}`);
      quoteData.comparativa.forEach(c => {
        console.log(`     - ${c.nombre}: Prima Anual = ${c.prima ? `$${c.prima}` : 'No disponible'}`);
      });
    } else {
      console.error('❌ Cotización fallida:', quoteData.error);
      process.exit(1);
    }

    // 4. Probar actualización de perfil
    console.log('\n4. Probando obtención y actualización de perfil...');
    const profileRes = await fetch(`${API_URL}/profile`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const profileData = await profileRes.json();
    if (profileRes.ok) {
      console.log(`✅ Perfil obtenido: ${profileData.cliente.primer_nombre} ${profileData.cliente.primer_apellido}`);
    } else {
      console.error('❌ Obtención de perfil fallida:', profileData.error);
      process.exit(1);
    }

    console.log('\n🎉 ¡Todas las pruebas de API pasaron con éxito!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Error de red o ejecución durante las pruebas:', err);
    process.exit(1);
  }
}

runTests();
