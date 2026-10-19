const dns = require('dns');
const mongoose = require('mongoose');

// A "mongodb+srv://" URI (what Atlas gives you) needs to look up an SRV DNS
// record before it can even try to connect. On some networks — many home
// routers, some ISPs, VPNs, and especially some Windows setups — the
// resolver Node picks up from the OS can't answer SRV queries, and you get
// "querySrv ECONNREFUSED" before Mongo is ever contacted. Pointing Node's
// resolver at public DNS servers that reliably answer SRV queries fixes this
// in the vast majority of cases. This has no effect on which database you
// connect to — it only changes how the hostname is looked up.
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('MongoDB connected:', mongoose.connection.host);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);

    if (err.message.includes('querySrv') || err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      console.error(
        '\nThis looks like a DNS problem resolving the "mongodb+srv://" address, not a ' +
        'code problem. If it persists after this fix, try:\n' +
        '  1. Confirm you have a working internet connection right now.\n' +
        '  2. Temporarily disable any VPN, proxy, or firewall/antivirus that filters DNS (UDP port 53), then retry.\n' +
        '  3. In Atlas: Network Access → make sure your current IP address is allowed (or 0.0.0.0/0 while testing).\n' +
        '  4. In Atlas: Database → Connect → Drivers, copy the connection string again and confirm the cluster\n' +
        '     hostname ("maralex-hospital.ktuzeax.mongodb.net") still matches what is in your .env file.\n' +
        '  5. As a fallback, in Atlas choose the legacy "Standard connection string" (starts with "mongodb://" and\n' +
        '     lists several hosts) instead of the "+srv" one — it needs no SRV lookup at all — and use that as\n' +
        '     MONGODB_URI instead.\n'
      );
    }
    process.exit(1);
  }
}

module.exports = connectDB;