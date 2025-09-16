const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { jsPDF } = require('jspdf');
const path = require('path');
const fs = require('fs');

const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
// const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const prisma = new PrismaClient();

app.use(cors({
  origin: [
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
    'http://localhost:5500', // Add this
    'http://localhost:5501', // Add this
    'https://gwingsoftwaretechnologies.com',
    'https://www.gwingsoftwaretechnologies.com' // Add www version
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// app.use('/', (req, res) =>{
//   return res.send('Hello World!');
// })

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Add this helper function at the top of your file after the imports
function formatDate(date) {
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}
 // Example usage

// Admin login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await prisma.admin.findUnique({ where: { username } });
    
    if (!admin || admin.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (error) {

    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/intern', async (req, res) => {
  try {
    const { fullName, email, mobile, qualification, role, duration, college } = req.body;
    // console.log(req.body);
    
    // Check if the email already exists
    const existingIntern = await prisma.intern.findUnique({ where: { email } });
    if (existingIntern) {
      return res.status(400).json({ error: 'Email already exists' });
    }


    
    const intern = await prisma.intern.create({ data: 
      {
        fullName: fullName,
        email: email,
        mobile: mobile,
        qualification: qualification,
        role: role,
        duration: duration,
        college: college,
        
      }
     });
    res.json(intern);
  } catch (error) {
    console.log('error',error);
    
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all interns
app.get('/api/interns', authenticateToken, async (req, res) => {
  try {
    const interns = await prisma.intern.findMany({
      orderBy: [
        { status: 'desc' },
        { endDate: 'asc' }
      ]
    });
    res.json(interns);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send offer letter
// Add this function at the top level of your file
async function generateOfferLetter(intern, startDate, endDate, internId) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const name = intern.fullName;
 
    // Load the full page background image
    const templatePath = path.join(__dirname, 'templates', 'letterhead.png');
    const templateBase64 = fs.readFileSync(templatePath, { encoding: 'base64' });
    
    // Add the full page background
    doc.addImage(`data:image/png;base64,${templateBase64}`, 'PNG', 0, 0, pageWidth, pageHeight);

    // Set font and formatting
    doc.setFont("helvetica");
    doc.setFontSize(12);
    doc.setLineHeightFactor(2);

    // Add content
    const startY = 50;
    doc.text(`Date: ${new Date(startDate).toDateString().slice(4,16)}`, 15, startY);
    doc.text(`ID: ${internId}`, 15, startY + 10);
    doc.text(`Dear ${name.toUpperCase()},`, 15, startY + 30);

    // Add paragraphs
    const paragraphs = [
    `We are delighted to extend an virtual internship offer for the ${intern.role} position at GWING SOFTWARE TECHNOLOGIES. Your skills and enthusiasm align well with our team, and we are excited to have you join us.`,
    `The internship will commence on ${new Date(startDate).toDateString().slice(4,16)}, and conclude on ${new Date(endDate).toDateString().slice(4,16)}. This program is designed to provide you with hands-on experience and opportunities to develop your skills. This is an unpaid internship.`,
    `As an intern, you will be responsible for completing assigned tasks to the best of your ability and adhering to all company guidelines.`,
    `By accepting this offer, you confirm your commitment to diligently executing assigned tasks and maintaining a high standard of work.`,
    `We look forward to welcoming you to the GWING team and supporting your career aspirations.`
];

let currentY = startY + 45;
paragraphs.forEach(paragraph => {
    doc.text(paragraph, 15, currentY, {
        maxWidth: pageWidth - 30,
        align: "justify"
    });
    currentY += 30; // Spacing set to half (15 units)
});
    

    // Return the PDF as buffer
    return doc.output('arraybuffer');
}

// Update your offer letter route

app.post('/api/interns/offer', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);

    const internshipId = `GWING${Date.now().toString().slice(-6)}`;
    

    const intern = await prisma.intern.update({
      where: { id: id },
      data: {
        status: 'OFFER_SENT',
        offerLetterSent: true,
        startDate,
        endDate,
        internId : internshipId
      }
    });
    const internId = intern.internId;
    // Fetch intern's ID
    // const internId = await prisma.intern.findUnique({
    //   where: { id: id },
    //   select: { internId: true }
    // });

    // Fetch tasks link based on intern's role
    const tasks = await prisma.tasksPdf.findFirst({
      where: { domain: intern.role }
    });

    // Generate the PDF
    const pdfBuffer = await generateOfferLetter(intern, startDate, endDate, internId);

    // Send offer letter email with tasks link
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: intern.email,
      subject: 'GWING Internship Offer Letter & Guidelines',
      html: `
         <h1>Congratulations on Your Internship Offer!</h1>
        <p>Dear ${intern.fullName},</p>
        <p>We are excited to welcome you as a ${intern.role} Intern at GWING Software Technologies. Your internship officially starts on <strong>${intern.startDate.toDateString().slice(4, 16)}</strong> and will conclude on <strong>${intern.endDate.toDateString().slice(4, 16)}</strong>.</p>
        
        <h2>Your Internship Task</h2>
        <p>To successfully complete your internship, you have to work on a project related to your role. Click the link below to view your task:</p>
        <a href="https://drive.google.com/file/d/1IRrPd1ecjtJ0jr0MIkpSe5JIL7mB5YEL/view?usp=sharing" target="_blank" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0;">View Your Internship Tasks</a>
        
        <h2>Important Guidelines for Your Internship Report</h2>
        <p>The most crucial part of your internship is the final report, which should be a minimum of 20 pages. This report is your opportunity to showcase everything you have learned and accomplished during your time with us. It's a way for us to understand your learning journey, not just your final project output.</p>
        
        <p><strong>Your report must include:</strong></p>
        <ul>
          <li>Your Name, InternId and Project Title</li>
          <li>A detailed account of your learning journey and activities throughout the internship.</li>
          <li>Links to your GitHub repositories for the projects.</li>
          <li>Links to LinkedIn video demonstrations of the projects you have completed.(Optional)</li>
        </ul>
        
        <p><strong>Key Takeaway:</strong> We understand that not all projects can be completed 100% within the internship period. What matters most is the effort and learning you put in. Even if you don't fully complete a task, your internship report should reflect your diligent effort and document the progress you made. This report serves as proof of your commitment and learning, which is the most important metric for us.</p>
        
        <p><strong>Submission Process:</strong> We will share a Google Form link in the official WhatsApp group for you to submit your internship report. Please submit your report in either PDF or Word format.</p>
        
        <p>Please find your official offer letter attached to this email. We are thrilled to have you on board and look forward to a successful internship experience with you.</p>
        
        <p>Best regards,<br>GWING Team</p>
      `,
      attachments: [
        {
          filename: `${intern.fullName}-offer-letter.pdf`,
          content: Buffer.from(pdfBuffer),
          contentType: 'application/pdf'
        }
      ]
    });

    res.json(intern);
  } catch (error) {
    console.log('error', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// app.post('/api/interns/offer', authenticateToken, async (req, res) => {
//   try {
//     const { id } = req.body;
//     const startDate = new Date();
//     const endDate = new Date(startDate);
//     endDate.setDate(endDate.getDate() + 30);

//     const internshipId = `GWING${Date.now().toString().slice(-6)}`;

//     const intern = await prisma.intern.update({
//       where: { id: id },
//       data: {
//         status: 'OFFER_SENT',
//         offerLetterSent: true,
//         startDate,
//         endDate,
//         internId : internshipId
//       }
//     });

//     // Generate the PDF
//     const pdfBuffer = await generateOfferLetter(intern, startDate, endDate);

//     // Send offer letter email
//     await transporter.sendMail({
//       from: process.env.SMTP_USER,
//       to: intern.email,
//       subject: 'GWING Internship Offer Letter',
//       html: `
//         <h1>Congratulations!</h1>
//         <p>Your internship at GWING Software Technologies starts on ${startDate.toLocaleDateString()}</p>
//         <p>Please find your offer letter attached.</p>
//       `,
//       attachments: [
//         {
//           filename: `${intern.fullName}-offer-letter.pdf`,
//           content: Buffer.from(pdfBuffer),
//           contentType: 'application/pdf'
//         }
//       ]
//     });

//     res.json(intern);
//   } catch (error) {
//     console.log('error', error);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// Send certificate
async function generateCertificate(intern, startDate, endDate) {
    const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const name = intern.fullName

    // Load the certificate background
    const templatePath = path.join(__dirname, 'templates', 'certificate-bg.png');
    const templateBase64 = fs.readFileSync(templatePath, { encoding: 'base64' });
    
    // Add the background
    doc.addImage(`data:image/png;base64,${templateBase64}`, 'PNG', 0, 0, pageWidth, pageHeight);

    // Set font and formatting for ID
    doc.setFont("helvetica");
    doc.setFontSize(14);
    doc.setTextColor("#0b1320");
    doc.text(`This certificate is proudly presented to ID: ${intern.internId}`, pageWidth / 2, 88, { align: "center" });

    // Set font for name
    doc.setFont("helvetica", "semi-bold");
    doc.setFontSize(30);
    doc.text(`${name.toUpperCase()}`, pageWidth / 2, 110, { align: "center" });

    // Set font for description
    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.text(
        `successfully completed Remote Internship at GWING Software Technologies, as a ${intern.role} Intern, actively contributing to projects from ${new Date(startDate).toDateString().slice(4,16)} to ${new Date(intern.endDate).toDateString().slice(4,16)} with unwavering dedication.`,
        pageWidth / 2,
        122,
        { align: "center", maxWidth: pageWidth - 70 }
    );

    return doc.output('arraybuffer');
}

// Update the certificate route
app.post('/api/interns/certificate/:id', authenticateToken, async (req, res) => {
        console.log('Received request to generate certificate for intern ID:', req.params.id);

    try {
        const { id } = req.params;
        
        const intern = await prisma.intern.findUnique({
            where: { id: id}
        });

        // if (!intern || !intern.startDate || !intern.endDate) {
        //     return res.status(400).json({ error: 'Invalid intern or dates' });
        // }

        // Generate the certificate
        const pdfBuffer = await generateCertificate(
            intern,
            new Date(intern.startDate),
            new Date(intern.endDate)
        );

        const updatedIntern = await prisma.intern.update({
            where: { id: id },
            data: {
                status: 'COMPLETED',
                certificateSent: true
            }
        });

        // Send certificate email
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: intern.email,
            subject: 'GWING Internship Certificate',
            html: `
                <h3>Congratulations on completing your internship!</h3>
                <p>Dear ${intern.fullName},</p>
                <p>We are pleased to present you with your internship completion certificate.</p>
                <p>Thank you for you joining GWING Software Technologies.</p>
            `,
            attachments: [{
                filename: `${intern.fullName}-certificate.pdf`,
                content: Buffer.from(pdfBuffer),
                contentType: 'application/pdf'
            }]
        });

        res.json(updatedIntern);
    } catch (error) {
        console.error('Certificate generation error:', error);
        res.status(500).json({ error: 'Failed to generate certificate' });
    }
});

// WhatsApp Link Routes
app.get('/api/whatsapp-link', async (req, res) => {
  try {
    const link = await prisma.whatsappLink.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    res.json(link);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch WhatsApp link' });
  }
});

app.post('/api/whatsapp-link', authenticateToken, async (req, res) => {
  try {
    const { whatsapp } = req.body;
    const link = await prisma.whatsappLink.create({
      data: { whatsapp }
    });
    res.json(link);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create WhatsApp link' });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));