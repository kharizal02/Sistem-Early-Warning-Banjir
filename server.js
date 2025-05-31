const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();

// HARDCODED USER CREDENTIALS (menggantikan database)
const users = [
  {
    email: 'pemerintah@gmail.com',
    password: 'admin123',
    username: 'Admin Pemerintah',
    role: 'pemerintah',
    desa: null
  },
  {
    email: 'kepaladesa1@gmail.com',
    password: 'desa1',
    username: 'Kepala Desa 1',
    role: 'kepala_desa',
    desa: 'desa1'
  },
  {
    email: 'kepaladesa2@gmail.com',
    password: 'desa2',
    username: 'Kepala Desa 2',
    role: 'kepala_desa',
    desa: 'desa2'
  },
  {
    email: 'warga@gmail.com',
    password: 'warga123',
    username: 'Warga Desa',
    role: 'warga',
    desa: null
  }
];

const bodyParser = require('body-parser');

// Middleware
app.use(express.urlencoded({ extended: true })); 
app.use(express.json()); // tambahkan ini
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi Email
const emailConfig = {
  service: 'gmail',
  user: 'mohamadkharizalfirdaus@gmail.com',
  pass: 'tnql ymkd foci ldbw',
  recipient: [
    'pemerintahkelompok9@gmail.com',
    'mkfscaraz@gmail.com',
    'bintangairlangga07@gmail.com'
  ],
};

const transporter = nodemailer.createTransport({
  service: emailConfig.service,
  auth: {
    user: emailConfig.user,
    pass: emailConfig.pass
  }
});

// Variabel untuk tracking email alert (PERBAIKAN UTAMA)
const emailAlertStatus = {
  desa1: {
    lastAlertSent: null,
    alertActive: false,
    dangerCondition: false,
    dangerStartTime: null,
    cooldownActive: false,
    cooldownEndTime: null
  },
  desa2: {
    lastAlertSent: null,
    alertActive: false,
    dangerCondition: false,
    dangerStartTime: null,
    cooldownActive: false,
    cooldownEndTime: null
  }
};

const EMAIL_COOLDOWN_PERIOD = 30 * 60 * 1000; // 30 menit
const MIN_DANGER_DURATION = 0; // Minimal 5 menit kondisi bahaya sebelum kirim email

// Fungsi untuk mengirim email peringatan bahaya banjir
async function sendFloodAlert(desa, waterLevel, sensorDistance, rainStatus) {
  const now = new Date();
  const desaName = desa === 'desa1' ? 'Desa 1' : 'Desa 2';
  
  // Update status alert
  emailAlertStatus[desa].lastAlertSent = now;
  emailAlertStatus[desa].alertActive = true;
  emailAlertStatus[desa].cooldownActive = true;
  emailAlertStatus[desa].cooldownEndTime = new Date(now.getTime() + EMAIL_COOLDOWN_PERIOD);

  const mailOptions = {
    from: emailConfig.user,
    to: emailConfig.recipient,
    subject: `🚨 ALERT BAHAYA BANJIR - ${desaName.toUpperCase()}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
          <h1>🚨 PERINGATAN BAHAYA BANJIR</h1>
        </div>
        
        <div style="padding: 20px; background-color: #f9f9f9;">
          <h2 style="color: #dc2626;">Kondisi Darurat Terdeteksi!</h2>
          
          <div style="background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #dc2626;">
            <h3>📍 Lokasi: ${desaName}</h3>
            <p><strong>🕐 Waktu:</strong> ${now.toLocaleString('id-ID')}</p>
            <p><strong>💧 Ketinggian Air:</strong> ${waterLevel.toFixed(1)} cm (MELUAP!)</p>
            <p><strong>📱 Jarak Sensor:</strong> ${sensorDistance} cm</p>
            <p><strong>🌧️ Status Hujan:</strong> ${rainStatus === 'heavy' ? 'HUJAN LEBAT' : 'HUJAN'}</p>
          </div>

          <div style="background-color: #fef2f2; padding: 15px; margin: 15px 0; border: 1px solid #fecaca;">
            <h3 style="color: #dc2626;">⚠️ TINDAKAN YANG DISARANKAN:</h3>
            <ul style="color: #7f1d1d;">
              <li>Segera evakuasi warga di area rawan banjir</li>
              <li>Siapkan jalur evakuasi alternatif</li>
              <li>Koordinasikan dengan tim tanggap darurat</li>
              <li>Pantau perkembangan kondisi secara real-time</li>
              <li>Informasikan kepada warga melalui sistem peringatan dini</li>
            </ul>
          </div>

          <div style="background-color: #1f2937; color: white; padding: 15px; margin: 15px 0;">
            <h4>📊 Detail Teknis:</h4>
            <p>• Batas bahaya: Jarak sensor < 10 cm</p>
            <p>• Kondisi saat ini: Air sudah meluap dan hujan lebat</p>
            <p>• Risiko: SANGAT TINGGI untuk banjir bandang</p>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #6b7280; font-size: 14px;">
              Email ini dikirim otomatis oleh Sistem Monitoring Banjir<br>
              Mohon segera lakukan tindakan pencegahan yang diperlukan.
            </p>
          </div>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 ✅ Email peringatan bahaya banjir berhasil dikirim untuk ${desaName}`);
    console.log(`📧 📤 Dikirim ke: ${emailConfig.recipient}`);
  } catch (error) {
    console.error(`📧 ❌ Error mengirim email untuk ${desaName}:`, error);
  }
}

// Fungsi untuk mengirim email status aman
async function sendSafeStatusEmail(desa) {
  const now = new Date();
  const desaName = desa === 'desa1' ? 'Desa 1' : 'Desa 2';

  const mailOptions = {
    from: emailConfig.user,
    to: emailConfig.recipient,
    subject: `✅ Update Status - ${desaName} Kondisi Aman`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #16a34a; color: white; padding: 20px; text-align: center;">
          <h1>✅ STATUS AMAN</h1>
        </div>
        
        <div style="padding: 20px; background-color: #f0fdf4;">
          <h2 style="color: #16a34a;">Kondisi Telah Kembali Normal</h2>
          
          <div style="background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #16a34a;">
            <h3>📍 Lokasi: ${desaName}</h3>
            <p><strong>🕐 Waktu:</strong> ${now.toLocaleString('id-ID')}</p>
            <p><strong>📊 Status:</strong> Kondisi air dan cuaca kembali normal</p>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #6b7280; font-size: 14px;">
              Sistem Monitoring Banjir - Update Status
            </p>
          </div>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    emailAlertStatus[desa].alertActive = false;
    console.log(`📧 ✅ Email status aman dikirim untuk ${desaName}`);
  } catch (error) {
    console.error(`📧 ❌ Error mengirim email status aman untuk ${desaName}:`, error);
  }
}

// Fungsi untuk memeriksa kondisi bahaya dan mengirim alert
function checkAndSendAlert(desa, sensorDistance, rainStatus) {
  const now = new Date();
  const waterLevel = convertSensorToWaterLevel(sensorDistance);
  const isWaterOverflowing = sensorDistance < DANGER_THRESHOLD;
  const isHeavyRain = rainStatus === 'heavy';
  const isDangerCondition = isWaterOverflowing && isHeavyRain;
  
  const alertStatus = emailAlertStatus[desa];

  // Periksa apakah cooldown sudah selesai
  if (alertStatus.cooldownActive && alertStatus.cooldownEndTime <= now) {
    alertStatus.cooldownActive = false;
    alertStatus.cooldownEndTime = null;
  }

  if (isDangerCondition) {
    // Jika kondisi bahaya baru dimulai
    if (!alertStatus.dangerCondition) {
      alertStatus.dangerCondition = true;
      alertStatus.dangerStartTime = now;
      console.log(`🚨 KONDISI BAHAYA BARU terdeteksi di ${desa.toUpperCase()}!`);
    } else {
      // Jika kondisi bahaya masih berlangsung
      const dangerDuration = now - alertStatus.dangerStartTime;
      
      // Kirim email jika:
      // 1. Belum ada email yang dikirim
      // 2. Sudah melewati durasi minimal bahaya
      // 3. Tidak dalam cooldown period
      if (!alertStatus.alertActive && 
          dangerDuration >= MIN_DANGER_DURATION && 
          !alertStatus.cooldownActive) {
        sendFloodAlert(desa, waterLevel, sensorDistance, rainStatus);
      }
    }
  } else {
    // Jika kondisi kembali normal setelah bahaya
    if (alertStatus.dangerCondition) {
      alertStatus.dangerCondition = false;
      alertStatus.dangerStartTime = null;
      console.log(`✅ Kondisi ${desa.toUpperCase()} kembali aman`);
      
      // Kirim email status aman jika sebelumnya ada alert
      if (alertStatus.alertActive) {
        sendSafeStatusEmail(desa);
      }
    }
  }
}

// LOGIN SYSTEM (HARDCODED - tanpa database)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Cari user berdasarkan email dan password
    const user = users.find(u => u.email === email && u.password === password);

    if (user) {
      console.log('🔐 Login berhasil:', user.username, '| Role:', user.role, '| Desa:', user.desa);

      // Redirect berdasarkan role
      if (user.role === 'pemerintah') {
        res.redirect('/pemerintah.html');
      } else if (user.role === 'kepala_desa') {
        res.redirect(`/kepala_${user.desa}.html`);
      } else if (user.role === 'warga') {
        res.redirect(`/warga_desa.html`);
      } else {
        res.send('<script>alert("Role tidak dikenali."); window.location.href="/login";</script>');
      }
    } else {
      res.send('<script>alert("Login gagal! Email atau password salah."); window.location.href="/login";</script>');
    }
  } catch (err) {
    console.error('❌ Error saat login:', err);
    res.status(500).send('Terjadi kesalahan saat login.');
  }
});

// API untuk melihat daftar user (untuk debugging)
app.get('/users', (req, res) => {
  // Kirim user tanpa password untuk keamanan
  const usersWithoutPassword = users.map(user => ({
    email: user.email,
    username: user.username,
    role: user.role,
    desa: user.desa
  }));
  
  res.json({
    message: 'Daftar user yang tersedia',
    users: usersWithoutPassword
  });
});

// Variabel penyimpan data
let latestData = {
  desa1: { distance: "17", rainStatus: "unknown", lastUpdate: null },
  desa2: { distance: "17", rainStatus: "unknown", lastUpdate: null }
};

let mqttConnected = false;

// Konstanta sensor
const MAX_SENSOR_DISTANCE = 17;
const MIN_SENSOR_DISTANCE = 0;
const DANGER_THRESHOLD = 10;
const WARNING_THRESHOLD = 13;

// Fungsi konversi sensor ke ketinggian air
function convertSensorToWaterLevel(sensorReading) {
  const sensorDistance = parseFloat(sensorReading);
  const waterLevel = MAX_SENSOR_DISTANCE - sensorDistance;
  return Math.max(0, Math.min(MAX_SENSOR_DISTANCE, waterLevel));
}

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

function mapRainStatus(sensorStatus) {
  const status = sensorStatus.toLowerCase().trim();
  
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
    const node = topic.includes('desa1') ? 'desa1' : 'desa2';
    
    if (topic.includes('hcsr04')) {
      const cleanData = message.toString().replace(/ cm/g, '').trim();
      const sensorDistance = parseFloat(cleanData);
      
      latestData[node].distance = cleanData;
      latestData[node].lastUpdate = now;
      
      const waterLevel = convertSensorToWaterLevel(sensorDistance);
      const waterStatus = getWaterStatus(sensorDistance);
      
      console.log(`📩 [${timeString}] ${node.toUpperCase()}:`);
      console.log(`   - Jarak sensor: ${sensorDistance} cm`);
      console.log(`   - Ketinggian air: ${waterLevel.toFixed(1)} cm`);
      console.log(`   - Status: ${waterStatus.message}`);
      
      checkAndSendAlert(node, sensorDistance, latestData[node].rainStatus);
      
    } else if (topic.includes('rain')) {
      const rawRainStatus = message.toString().trim();
      const mappedRainStatus = mapRainStatus(rawRainStatus);
      
      latestData[node].rainStatus = mappedRainStatus;
      
      console.log(`🌧️ [${timeString}] Status hujan ${node}: ${rawRainStatus} -> ${mappedRainStatus}`);
      
      checkAndSendAlert(node, parseFloat(latestData[node].distance), mappedRainStatus);
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

// API Endpoint
app.get('/data', (req, res) => {
  const desa1WaterLevel = convertSensorToWaterLevel(latestData.desa1.distance);
  const desa2WaterLevel = convertSensorToWaterLevel(latestData.desa2.distance);
  const desa1Status = getWaterStatus(latestData.desa1.distance);
  const desa2Status = getWaterStatus(latestData.desa2.distance);
  
  res.json({
    desa1: {
      sensorDistance: parseFloat(latestData.desa1.distance),
      waterLevel: desa1WaterLevel,
      rainStatus: latestData.desa1.rainStatus,
      waterStatus: desa1Status,
      lastUpdate: latestData.desa1.lastUpdate,
      emailAlert: emailAlertStatus.desa1
    },
    desa2: {
      sensorDistance: parseFloat(latestData.desa2.distance),
      waterLevel: desa2WaterLevel,
      rainStatus: latestData.desa2.rainStatus,
      waterStatus: desa2Status,
      lastUpdate: latestData.desa2.lastUpdate,
      emailAlert: emailAlertStatus.desa2
    },
    mqttConnected: mqttConnected,
    serverTime: new Date().toISOString(),
    thresholds: {
      maxSensorDistance: MAX_SENSOR_DISTANCE,
      dangerThreshold: DANGER_THRESHOLD,
      warningThreshold: WARNING_THRESHOLD
    }
  });
});

// API lainnya (status, debug, dll)
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
    emailSystem: {
      config: {
        recipient: emailConfig.recipient,
        cooldownPeriod: EMAIL_COOLDOWN_PERIOD / 1000 / 60 + ' minutes',
        minDangerDuration: MIN_DANGER_DURATION / 1000 / 60 + ' minutes'
      },
      status: emailAlertStatus
    },
    timestamp: new Date().toISOString()
  });
});

// API untuk test kirim email manual
app.post('/test-email/:desa', async (req, res) => {
  const desa = req.params.desa;
  
  if (!['desa1', 'desa2'].includes(desa)) {
    return res.status(400).json({ error: 'Desa harus desa1 atau desa2' });
  }
  
  try {
    // Simulate kondisi bahaya untuk testing
    await sendFloodAlert(desa, 12.5, 4.5, 'heavy');
    res.json({ 
      success: true, 
      message: `Test email berhasil dikirim untuk ${desa}`,
      recipient: emailConfig.recipient
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API untuk reset email alert status
app.post('/reset-email-alert/:desa', (req, res) => {
  const desa = req.params.desa;
  
  if (!['desa1', 'desa2'].includes(desa)) {
    return res.status(400).json({ error: 'Desa harus desa1 atau desa2' });
  }
  
  emailAlertStatus[desa] = {
    lastAlertSent: null,
    alertActive: false,
    dangerCondition: false,
    dangerStartTime: null,
    cooldownActive: false,
    cooldownEndTime: null
  };
  
  console.log(`🔄 Email alert status untuk ${desa} telah direset`);
  
  res.json({
    success: true,
    message: `Email alert status untuk ${desa} berhasil direset`,
    newStatus: emailAlertStatus[desa]
  });
});

// API endpoint lainnya...
app.get('/', (req, res) => {
  res.redirect('/login');
});

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

app.get('/rain-status', (req, res) => {
  res.json({
    desa1: latestData.desa1.rainStatus,
    desa2: latestData.desa2.rainStatus
  });
});

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
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log('🔐 Login Credentials:');
  console.log('   - Pemerintah: pemerintah@admin.com / admin123');
  console.log('   - Kepala Desa 1: kepala1@desa1.com / desa1123');
  console.log('   - Kepala Desa 2: kepala2@desa2.com / desa2123');
  console.log('   - Warga: warga@desa.com / warga123');
  console.log(`📡 Listening to topics:`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa1/hcsr04`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa1/rain`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa2/hcsr04`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa2/rain`);
  console.log(`💧 Logika Air:`);
  console.log(`   - Jarak sensor 17cm = tidak ada air (ketinggian 0cm)`);
  console.log(`   - Jarak sensor < 10cm = BAHAYA (air meluap)`);
  console.log(`   - Jarak sensor < 13cm = PERINGATAN (air naik)`);
  console.log(`🌧️ Rain status mapping: "heavy rain"/"hujan lebat" -> "heavy"`);
  console.log(`📧 Email Alert System:`);
  console.log(`   - Recipient: ${emailConfig.recipient}`);
  console.log(`   - Trigger: Air meluap (< 10cm) + Hujan lebat`);
  console.log(`   - Cooldown: ${EMAIL_COOLDOWN_PERIOD / 1000 / 60} menit`);
  console.log(`   - Minimal durasi bahaya sebelum kirim email: ${MIN_DANGER_DURATION / 1000 / 60} menit`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  mqttClient.end();
  process.exit(0);
});

module.exports = app;