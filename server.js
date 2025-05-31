const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');

const app = express();

//WebSocket
const http = require('http');
const WebSocket = require('ws');

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

//postgreSQL
const pool = require('./database'); // koneksi PostgreSQL
const bodyParser = require('body-parser'); // untuk parsing form login

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));


//koneksi postgreSQL
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

    // ⬇️ Cek nilai input dari form login
  console.log('📥 Email:', email, '| Password:', password);

  try {
    const result = await pool.query(
  'SELECT * FROM users WHERE email = $1 AND password = $2',
  [email, password]
);

    if (result.rows.length > 0) {
        const user = result.rows[0];
        console.log('🔐 Login berhasil:', user.username, '| Role:', user.role, '| Desa:', user.desa);

        if (user.role === 'pemerintah') {
          res.redirect('/index.html');
          } else if (user.role === 'kepala_desa') {
          res.redirect(`/kepala_${user.desa}.html`);
          } else if (user.role === 'warga') {
          res.redirect(`/warga_${user.desa}.html`);
        } else {
          console.warn('⚠️ Role tidak dikenali:', user.role);
          res.send('<script>alert("Role tidak dikenali."); window.location.href="/login";</script>');
        }
        } else {
            console.log('❌ Login gagal untuk:', email);
            res.send('<script>alert("Login gagal!"); window.location.href="/login";</script>');
        }

  } catch (err) {
    console.error('❌ Error saat login:', err);
    res.status(500).send('Terjadi kesalahan saat login.');
  }
});


// Variabel penyimpan data
let latestData = {
  desa1: { distance: "17", rainStatus: "unknown", lastUpdate: null },
  desa2: { distance: "17", rainStatus: "unknown", lastUpdate: null }
};

// Status koneksi mqtt
let mqttConnected = false;

// Konstanta untuk sensor ultrasonik
const MAX_SENSOR_DISTANCE = 17; // Jarak maksimal sensor (tidak ada air)
const MIN_SENSOR_DISTANCE = 0;  // Jarak minimal sensor (air penuh)
const DANGER_THRESHOLD = 10;    // Jika jarak sensor < 10cm = air meluap
const WARNING_THRESHOLD = 13;   // Jika jarak sensor < 13cm = air mulai naik

// Fungsi untuk konversi jarak sensor ke ketinggian air
function convertSensorToWaterLevel(sensorReading) {
  const sensorDistance = parseFloat(sensorReading);
  // Ketinggian air = maksimal jarak sensor - jarak yang terbaca
  // Semakin kecil jarak sensor, semakin tinggi air
  const waterLevel = MAX_SENSOR_DISTANCE - sensorDistance;
  return Math.max(0, Math.min(MAX_SENSOR_DISTANCE, waterLevel));
}

// Fungsi untuk menentukan status air berdasarkan jarak sensor
function getWaterStatus(sensorReading) {
  const sensorDistance = parseFloat(sensorReading);
  
  if (sensorDistance < DANGER_THRESHOLD) {
    return {
      status: 'danger',
      message: 'MELUAP - Air sangat tinggi!',
      level: 'bahaya'
    };
  } else if (sensorDistance < WARNING_THRESHOLD) {
    return {
      status: 'warning', 
      message: 'NAIK - Air mulai tinggi',
      level: 'peringatan'
    };
  } else {
    return {
      status: 'normal',
      message: 'NORMAL - Air dalam batas aman',
      level: 'aman'
    };
  }
}

// Fungsi untuk mapping status hujan dari sensor ke format yang diharapkan frontend
function mapRainStatus(sensorStatus) {
  const status = sensorStatus.toLowerCase().trim();
  
  // Mapping berbagai format status hujan dari sensor
  if (status.includes('heavy rain') || status.includes('hujan lebat')) {
    return 'heavy';
  } else if (status.includes('moderate rain') || status.includes('hujan sedang')) {
    return 'moderate';
  } else if (status.includes('light rain') || status.includes('gerimis')) {
    return 'light';
  } else if (status.includes('no rain') || status.includes('cerah') || status.includes('dry')) {
    return 'none';
  } else {
    return 'unknown';
  }
}

// Koneksi MQTT
const mqttClient = mqtt.connect('mqtt://maqiatto.com', {
  port: 1883,
  username: 'mohamadkharizalfirdaus@gmail.com',
  password: 'Rizal020305+',
  keepalive: 60,
  reconnectPeriod: 5000,
  clean: true
});

mqttClient.on('connect', () => {
  console.log('✅ Terhubung ke MQTT Broker (maqiatto.com)');
  mqttConnected = true;
  
  // Subscribe ke semua topik yang diperlukan
  const topics = [
    'mohamadkharizalfirdaus@gmail.com/desa1/hcsr04',
    'mohamadkharizalfirdaus@gmail.com/desa1/rain',
    'mohamadkharizalfirdaus@gmail.com/desa2/hcsr04',
    'mohamadkharizalfirdaus@gmail.com/desa2/rain'
  ];
  
  mqttClient.subscribe(topics, (err) => {
    if (err) {
      console.error('❌ Error subscribe topic:', err);
    } else {
      console.log('📡 Subscribed to topics:', topics);
    }
  });
});

mqttClient.on('message', (topic, message) => {
  const now = new Date();
  const timeString = now.toLocaleTimeString();
  
  try {
    // Tentukan node mana yang mengirim data
    const node = topic.includes('desa1') ? 'desa1' : 'desa2';
    
    if (topic.includes('hcsr04')) {
      // Bersihkan data (hilangkan " cm" jika ada)
      const cleanData = message.toString().replace(/ cm/g, '').trim();
      const sensorDistance = parseFloat(cleanData);
      
      // Update data jarak sensor (bukan ketinggian air)
      latestData[node].distance = cleanData;
      latestData[node].lastUpdate = now;
      
      // Hitung ketinggian air untuk logging
      const waterLevel = convertSensorToWaterLevel(sensorDistance);
      const waterStatus = getWaterStatus(sensorDistance);
      
      console.log(`📩 [${timeString}] ${node.toUpperCase()}:`);
      console.log(`   - Jarak sensor: ${sensorDistance} cm`);
      console.log(`   - Ketinggian air: ${waterLevel.toFixed(1)} cm`);
      console.log(`   - Status: ${waterStatus.message}`);
      
    } else if (topic.includes('rain')) {
      // Update status hujan dengan mapping yang benar
      const rawRainStatus = message.toString().trim();
      const mappedRainStatus = mapRainStatus(rawRainStatus);
      
      latestData[node].rainStatus = mappedRainStatus;
      
      console.log(`🌧️ [${timeString}] Status hujan ${node}: ${rawRainStatus} -> ${mappedRainStatus}`);
    }
    
  } catch (error) {
    console.error('❌ Error parsing MQTT message:', error);
  }
});

// Handle koneksi terputus
mqttClient.on('disconnect', () => {
  console.log('⚠️ MQTT disconnected');
  mqttConnected = false;
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT Error:', error);
  mqttConnected = false;
});

// API Endpoint utama
app.get('/data', (req, res) => {
  // Konversi jarak sensor ke ketinggian air untuk response
  const desa1WaterLevel = convertSensorToWaterLevel(latestData.desa1.distance);
  const desa2WaterLevel = convertSensorToWaterLevel(latestData.desa2.distance);
  const desa1Status = getWaterStatus(latestData.desa1.distance);
  const desa2Status = getWaterStatus(latestData.desa2.distance);
  
  res.json({
    desa1: {
      sensorDistance: parseFloat(latestData.desa1.distance), // Jarak sensor asli
      waterLevel: desa1WaterLevel, // Ketinggian air yang dihitung
      rainStatus: latestData.desa1.rainStatus,
      waterStatus: desa1Status,
      lastUpdate: latestData.desa1.lastUpdate
    },
    desa2: {
      sensorDistance: parseFloat(latestData.desa2.distance), // Jarak sensor asli
      waterLevel: desa2WaterLevel, // Ketinggian air yang dihitung
      rainStatus: latestData.desa2.rainStatus,
      waterStatus: desa2Status,
      lastUpdate: latestData.desa2.lastUpdate
    },
    mqttConnected: mqttConnected,
    serverTime: new Date().toISOString(),
    // Tambahan info untuk debugging
    thresholds: {
      maxSensorDistance: MAX_SENSOR_DISTANCE,
      dangerThreshold: DANGER_THRESHOLD,
      warningThreshold: WARNING_THRESHOLD
    }
  });
});

// API untuk status sistem
app.get('/status', (req, res) => {
  const desa1WaterLevel = convertSensorToWaterLevel(latestData.desa1.distance);
  const desa2WaterLevel = convertSensorToWaterLevel(latestData.desa2.distance);
  
  res.json({
    server: 'running',
    mqtt: {
      connected: mqttConnected,
      lastDataDesa1: latestData.desa1.lastUpdate,
      lastDataDesa2: latestData.desa2.lastUpdate
    },
    data: {
      desa1: {
        sensorDistance: parseFloat(latestData.desa1.distance),
        waterLevel: desa1WaterLevel,
        rainStatus: latestData.desa1.rainStatus,
        status: getWaterStatus(latestData.desa1.distance)
      },
      desa2: {
        sensorDistance: parseFloat(latestData.desa2.distance),
        waterLevel: desa2WaterLevel,
        rainStatus: latestData.desa2.rainStatus,
        status: getWaterStatus(latestData.desa2.distance)
      }
    },
    timestamp: new Date().toISOString()
  });
});

// API untuk debug water level calculation
app.get('/debug/water', (req, res) => {
  const testDistances = [0, 5, 10, 13, 15, 17];
  const calculations = testDistances.map(distance => {
    return {
      sensorDistance: distance,
      waterLevel: convertSensorToWaterLevel(distance),
      status: getWaterStatus(distance)
    };
  });
  
  res.json({
    current: {
      desa1: {
        sensorDistance: parseFloat(latestData.desa1.distance),
        waterLevel: convertSensorToWaterLevel(latestData.desa1.distance),
        status: getWaterStatus(latestData.desa1.distance)
      },
      desa2: {
        sensorDistance: parseFloat(latestData.desa2.distance),
        waterLevel: convertSensorToWaterLevel(latestData.desa2.distance),
        status: getWaterStatus(latestData.desa2.distance)
      }
    },
    testCalculations: calculations,
    explanation: {
      logic: "Ketinggian air = 17cm - jarak sensor",
      examples: [
        "Sensor baca 17cm (tidak ada air) → ketinggian air = 0cm",
        "Sensor baca 10cm → ketinggian air = 7cm", 
        "Sensor baca 5cm → ketinggian air = 12cm (BAHAYA!)",
        "Sensor baca 0cm → ketinggian air = 17cm (MELUAP!)"
      ]
    }
  });
});

// API untuk debug rain status mapping
app.get('/debug/rain', (req, res) => {
  res.json({
    desa1: {
      current: latestData.desa1.rainStatus,
      lastUpdate: latestData.desa1.lastUpdate
    },
    desa2: {
      current: latestData.desa2.rainStatus,
      lastUpdate: latestData.desa2.lastUpdate
    },
    mapping: {
      'heavy rain': mapRainStatus('heavy rain'),
      'no rain': mapRainStatus('no rain'),
      'rain': mapRainStatus('rain'),
      'dry': mapRainStatus('dry'),
      'hujan': mapRainStatus('hujan'),
      'tidak hujan': mapRainStatus('tidak hujan')
    }
  });
});

//koneksi WebSocket
wss.on('connection', (ws) => {
  console.log('🔌 Client terhubung via WebSocket');
  clients.push(ws);

  ws.on('close', () => {
    console.log('❌ Client WebSocket terputus');
    clients = clients.filter(client => client !== ws);
  });
});

// Serve static files (HTML)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// fetch desa1
app.get('/desa1/data', (req, res) => {
  const desa = latestData.desa1;
  res.json({
    sensorDistance: parseFloat(desa.distance),
    waterLevel: convertSensorToWaterLevel(desa.distance),
    rainStatus: desa.rainStatus,
    sensorActive: true,
    mqttConnected
  });
});


// fetch desa2
app.get('/desa2/data', (req, res) => {
  const desa = latestData.desa2;
  res.json({
    sensorDistance: parseFloat(desa.distance),
    waterLevel: convertSensorToWaterLevel(desa.distance),
    rainStatus: desa.rainStatus,
    sensorActive: true,
    mqttConnected
  });
});

//fetch rain-status
app.get('/rain-status', (req, res) => {
  res.json({
    desa1: latestData.desa1.rainStatus,
    desa2: latestData.desa2.rainStatus
  });
});

//fetch chart-data 
app.get('/chart-data', (req, res) => {
  res.json({
    desa1: {
      waterLevel: convertSensorToWaterLevel(latestData.desa1.distance)
    },
    desa2: {
      waterLevel: convertSensorToWaterLevel(latestData.desa2.distance)
    }
  });
});



// Error handling
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    //Test koneksi ke PostgreSQL
       pool.connect((err, client, release) => {
      if (err) {
        return console.error('❌ Gagal koneksi ke database:', err.stack);
      }
      console.log('✅ Berhasil koneksi ke PostgreSQL');
      release(); // kembalikan client ke pool
      });
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`📡 Listening to topics:`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa1/hcsr04`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa1/rain`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa2/hcsr04`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa2/rain`);
  console.log(`💧 Logika Air:`);
  console.log(`   - Jarak sensor 17cm = tidak ada air (ketinggian 0cm)`);
  console.log(`   - Jarak sensor < 10cm = BAHAYA (air meluap)`);
  console.log(`   - Jarak sensor < 13cm = PERINGATAN (air naik)`);
  console.log(`🌧️ Rain status mapping: "heavy rain"/"rain" -> "hujan", "no rain"/"dry" -> "tidak hujan"`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  mqttClient.end();
  process.exit(0);
});