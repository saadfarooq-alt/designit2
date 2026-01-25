import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: "DesignIt Contact Form <onboarding@resend.dev>", // Resend's verified domain
      to: process.env.CONTACT_EMAIL || "info@idesignits.com",
      replyTo: email,
      subject: `[DesignIt Contact] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #800000; border-bottom: 2px solid #800000; padding-bottom: 10px;">
            New Contact Form Submission
          </h2>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 10px 0;">
              <strong style="color: #333;">Name:</strong><br/>
              <span style="color: #666;">${name}</span>
            </p>
            
            <p style="margin: 10px 0;">
              <strong style="color: #333;">Email:</strong><br/>
              <a href="mailto:${email}" style="color: #800000;">${email}</a>
            </p>
            
            <p style="margin: 10px 0;">
              <strong style="color: #333;">Subject:</strong><br/>
              <span style="color: #666;">${subject}</span>
            </p>
          </div>
          
          <div style="background-color: #fff; padding: 20px; border-left: 4px solid #800000; margin: 20px 0;">
            <strong style="color: #333;">Message:</strong>
            <p style="color: #666; line-height: 1.6; margin-top: 10px;">
              ${message.replace(/\n/g, '<br/>')}
            </p>
          </div>
          
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This email was sent from the DesignIt contact form at idesignits.com
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { error: "Failed to send email. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        success: true, 
        message: "Email sent successfully",
        id: data?.id 
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      { error: "Failed to send email. Please try again later." },
      { status: 500 }
    );
  }
}
