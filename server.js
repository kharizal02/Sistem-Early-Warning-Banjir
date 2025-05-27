const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Variabel penyimpan data
let latestData = {
  desa1: { distance: "0", lastUpdate: null },
  desa2: { distance: "0", lastUpdate: null }
};

// Status koneksi
let mqttConnected = false;

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
  
  // Subscribe ke kedua topik
  const topics = [
    'mohamadkharizalfirdaus@gmail.com/desa1/hcsr04',
    'mohamadkharizalfirdaus@gmail.com/desa2/hcsr04'
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
    // Bersihkan data (hilangkan " cm" jika ada)
    const cleanData = message.toString().replace(/ cm/g, '').trim();
    
    // Tentukan node mana yang mengirim data
    const node = topic.includes('desa1') ? 'desa1' : 'desa2';
    
    // Update data real-time
    latestData[node].distance = cleanData;
    latestData[node].lastUpdate = now;
    
    console.log(`📩 [${timeString}] Data ${node}: ${cleanData} cm`);
    
  } catch (error) {
    console.error('❌ Error parsing MQTT message:', error);
  }
});

// API Endpoint utama
app.get('/data', (req, res) => {
  res.json({
    desa1: {
      distance: latestData.desa1.distance,
      lastUpdate: latestData.desa1.lastUpdate
    },
    desa2: {
      distance: latestData.desa2.distance,
      lastUpdate: latestData.desa2.lastUpdate
    },
    mqttConnected: mqttConnected,
    serverTime: new Date().toISOString()
  });
});

// API untuk status sistem
app.get('/status', (req, res) => {
  res.json({
    server: 'running',
    mqtt: {
      connected: mqttConnected,
      lastDataDesa1: latestData.desa1.lastUpdate,
      lastDataDesa2: latestData.desa2.lastUpdate
    },
    data: {
      desa1: {
        value: latestData.desa1.distance
      },
      desa2: {
        value: latestData.desa2.distance
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Serve static files (HTML)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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
  console.log(`📡 Listening to topics:`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa1/hcsr04`);
  console.log(`   - mohamadkharizalfirdaus@gmail.com/desa2/hcsr04`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  mqttClient.end();
  process.exit(0);
});