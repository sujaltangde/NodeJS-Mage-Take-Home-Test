const net = require('net');
const fs = require('fs')

const HOST = 'localhost'; 
const PORT = 3000; 
let packets = []; 
let receivedSeqs = new Set(); 




const client = new net.Socket();


client.connect(PORT, HOST, () => {
    console.log('Connected to the BetaCrew exchange server');
    const requestPayload = Buffer.alloc(2);
    requestPayload.writeUInt8(1, 0);

    client.write(requestPayload);
});


client.on('data', (data) => {
    handleData(data)
});


client.on('error', (err) => {
    console.error(`Error: ${err.message}`);
});


client.on('end', () => {
    console.log('Connection closed by the server');

    const totalPackets = Math.max(...receivedSeqs); 
    const missingPackets = [];
    for (let seq = 1; seq <= totalPackets; seq++) {
        if (!receivedSeqs.has(seq)) {
            missingPackets.push(seq);
        }
    }

    console.log(`Received packets: ${Array.from(receivedSeqs)}`);
    console.log(`Missing packets: ${missingPackets.join(', ')}`);

    if (missingPackets.length > 0) {

        const clients = [];
        for (let p of missingPackets) {
            clients.push(connectAndSend(p));
        }

        Promise.all(clients)
            .then(() => {
                packets.sort((a, b) => a.packetSequence - b.packetSequence)
                createJsonFile(packets)
            })
            .catch((error) => {
                console.error('One or more connections failed:', error);
            });
    }
})





const handleData = (data) => {
    const packetSize = 17;
    const packetCount = data.length / packetSize;

    for (let i = 0; i < packetCount; i++) {
        const packet = data.slice(i * packetSize, (i + 1) * packetSize);

        const symbol = packet.slice(0, 4).toString('ascii').trim(); 
        const buySellIndicator = packet.readUInt8(4); 
        const quantity = packet.readUInt32BE(5); 
        const price = packet.readUInt32BE(9); 
        const packetSequence = packet.readUInt32BE(13); 

        packets.push({ symbol, buySellIndicator: String.fromCharCode(buySellIndicator), quantity, price, packetSequence });
        receivedSeqs.add(packetSequence);
    }
};


function handleResendPacketResponse(packet) {

    const symbol = packet.slice(0, 4).toString('ascii').trim();
    const buySellIndicator = packet.readUInt8(4); 
    const quantity = packet.readUInt32BE(5); 
    const price = packet.readUInt32BE(9); 
    const packetSequence = packet.readUInt32BE(13);
    
    packets.push({ symbol, buySellIndicator: String.fromCharCode(buySellIndicator), quantity, price, packetSequence })
}


function createJsonFile(dataArray) {
    const jsonData = JSON.stringify(dataArray, null, 2);

    fs.writeFile('output.json', jsonData, (err) => {
        if (err) {
            console.error('Error writing to file', err);
        } else {
            console.log('JSON file created successfully:', 'output.json');
        }
    });
}

const connectAndSend = (packetSequence) => {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();

        client.connect(PORT, HOST, () => {
            console.log(`Connected to the BetaCrew exchange server for client ${packetSequence}`);
            const request = Buffer.alloc(2);
            request.writeUInt8(2, 0);
            request.writeUInt8(packetSequence, 1);

            client.write(request);
        });

        client.on('data', (data) => {
            handleResendPacketResponse(data);
            console.log(`Disconnected to the BetaCrew exchange server for client ${packetSequence}`);
            client.destroy();
            resolve();
        });

        client.on('error', (err) => {
            console.error(`Error for client ${packetSequence}:`, err);
            client.destroy();
            reject(err);
        });
    });
};
















