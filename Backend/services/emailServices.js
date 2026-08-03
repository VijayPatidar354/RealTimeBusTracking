const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOtpEmail(toEmail, code) {
  await resend.emails.send({
    from: "BusTrack <onboarding@resend.dev>", // free-tier shared sender — no domain setup needed
    to: toEmail,
    subject: "Your BusTrack verification code",
    html: `<p>Your verification code is <b>${code}</b>. It expires in 5 minutes.</p>`,
    text: `Your verification code is ${code}. It expires in 5 minutes.`,
  });
}

module.exports = { sendOtpEmail };
