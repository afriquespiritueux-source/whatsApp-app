const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.static('public'));

const VERIFY_TOKEN = "mon_token_secret_123";
// ⚠️ REMETTEZ VOTRE TOKEN ICI (celui qui commence par EAAT...)
const WHATSAPP_TOKEN = "EAATttGsWz8kBS4xuTKZApLUgEuBSHUfwna0625yZCZBA3XjegLWCUU3shk9qbnkrkH8XPMklAOBcnloH3ssoOdABmn1R1vHDiCYnpV7XhAAZCUchuV12SeMYUogtJZAJdpAfNG5c3hy2frZA5YiqJiQOIO1lGJcYW2wWqeutWBLS7uveBMnsqJBi30hJbrpwZDZD"; 
const PHONE_NUMBER_ID = "1360862047116900";
const SUPABASE_URL = "https://nppaqxfbsjtiguakfkat.supabase.co";
const SUPABASE_KEY = "sb_publishable_AndUnPjRmEA4Q7fsm037Kg_mkmFkN2W";

// 1. Vérification du Webhook
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// 2. Réception des messages de WhatsApp
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            const value = body.entry[0].changes[0].value;
            if (value.messages && value.messages[0]) {
                const message = value.messages[0];
                const from = message.from;
                const name = value.contacts[0].profile.name;
                const text = message.text ? message.text.body : "[Média]";

                await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
                    contact_number: from,
                    contact_name: name,
                    direction: 'inbound',
                    content: text
                }, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    }
                });
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Erreur:", error.message);
        res.sendStatus(500);
    }
});

// 3. ENVOI DE MESSAGE DEPUIS L'INTERFACE (C'est ici que ça bloquait)
app.post('/api/send', async (req, res) => {
    const { to, text } = req.body;
    try {
        // A. Envoyer sur WhatsApp
        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: text }
        }, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });

        // B. Enregistrer dans Supabase pour l'afficher dans l'interface
        await axios.post(`${SUPABASE_URL}/rest/v1/messages`, {
            contact_number: to,
            contact_name: 'Moi',
            direction: 'outbound',
            content: text
        }, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Erreur d'envoi:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.message });
    }
});

// 4. Afficher la page HTML
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/app.html');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
