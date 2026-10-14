import sys
import subprocess

try:
    import pptx
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-pptx"])
    import pptx

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_deck():
    prs = Presentation()
    # 16:9 Widescreen
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Friendly, modern color palette
    COLOR_PRIMARY = RGBColor(30, 41, 59)      # Slate Navy (#1e293b)
    COLOR_ACCENT = RGBColor(14, 116, 144)     # Ocean Teal (#0e7490)
    COLOR_HIGHLIGHT = RGBColor(234, 88, 12)   # Coral Orange (#ea580c)
    COLOR_TEXT_DARK = RGBColor(51, 65, 85)    # Body Slate (#334155)
    COLOR_TEXT_MUTED = RGBColor(100, 116, 139)# Gray (#64748b)
    COLOR_BG_CARD = RGBColor(248, 250, 252)   # Card Fill (#f8fafc)
    COLOR_BORDER = RGBColor(226, 232, 240)    # Soft Border (#e2e8f0)
    COLOR_WHITE = RGBColor(255, 255, 255)

    slides_data = [
        # Slide 1
        {
            "is_title": True,
            "title": "Smart Bus Tracking &\nFleet Management System",
            "subtitle": "A Simple, Real-Time Solution for Stress-Free Daily Commuting",
            "meta": [
                "Project Overview & Live Demonstration",
                "Built with: React, Node.js, Real-Time WebSockets & Open Maps",
                "Presented by: [Your Name / Team Names]",
                "Guided by: [Your Project Guide / Professor Name]"
            ],
            "notes": "Welcome everyone. Today we are excited to show you our Smart Bus Tracking system. We built this project to solve a problem we all experience: waiting at a bus stop without having any idea when the bus will actually arrive. Let's see how our system makes daily commuting simple, predictable, and safe."
        },
        # Slide 2
        {
            "category": "THE DAILY REALITY",
            "title": "Have You Ever Waited at a Bus Stop Like This?",
            "boxes": [
                {"title": "The Big Question", "content": "Did the bus already leave? Is it stuck in traffic? Will it arrive in 2 minutes or 25 minutes? Commuters have zero visibility."},
                {"title": "Wasted Time & Anxiety", "content": "People stand waiting in the rain or heat, constantly checking their watches, unsure whether to keep waiting or hire an expensive cab."},
                {"title": "Overcrowded Stops", "content": "Because nobody knows bus timings, people bunch together at stops, leading to sudden rushes and chaotic boarding."},
                {"title": "The Core Issue", "content": "Paper timetables and static schedule boards don't work in the real world because daily traffic is always changing."}
            ],
            "notes": "Start with this relatable scenario. Ask the reviewers: 'How often have you stood at a bus stop with no idea where the bus is?' This establishes the human need for the project immediately."
        },
        # Slide 3
        {
            "category": "THE 3 BIG PROBLEMS",
            "title": "Why Existing Solutions Fail",
            "boxes": [
                {"title": "1. For Passengers", "content": "Static schedules lie. When a bus is delayed by 15 minutes, the passenger app still shows the scheduled time, breaking commuter trust."},
                {"title": "2. For Bus Drivers", "content": "Many tracking apps require drivers to tap their phones at every single stop. Tapping a screen while driving a heavy bus is dangerous!"},
                {"title": "3. For Bus Owners", "content": "Small fleet operators manage everything through phone calls and paper notebooks. They have no live dashboard to see their buses."},
                {"title": "4. The Cost Trap", "content": "Apps using Google Maps pay heavy fees every time someone loads a map. That makes transit systems too expensive for regular colleges or towns."}
            ],
            "notes": "Explain that current apps fail for three reasons: passengers don't get live updates, drivers get dangerously distracted tapping screens, and operators can't afford expensive proprietary map licenses."
        },
        # Slide 4
        {
            "category": "OUR SOLUTION",
            "title": "A Connected, Hands-Free Transit Experience",
            "boxes": [
                {"title": "Live Map for Commuters", "content": "Open the webpage on any phone or laptop. Watch the bus move smoothly along the route in real time with live arrival countdowns."},
                {"title": "100% Hands-Free for Drivers", "content": "The driver simply hits 'Start Trip'. The system automatically marks stops as reached using smart digital geofences - zero screen tapping!"},
                {"title": "Live Owner Control Room", "content": "Bus owners get an intuitive control panel to create routes, add stops, assign buses to drivers, and monitor schedules."},
                {"title": "Affordable & Open", "content": "Built with open-source maps (OpenStreetMap & Leaflet), ensuring zero monthly map licensing bills."}
            ],
            "notes": "Here is the big picture: One unified platform that connects passengers, drivers, and owners seamlessly without expensive fees or complicated hardware."
        },
        # Slide 5
        {
            "category": "USER ROLES",
            "title": "Designed for Everyone in the Transit Journey",
            "boxes": [
                {"title": "Commuters / Passengers", "content": "Search any route, check live bus positions on a clean map, get realistic arrival times, and tap 'I am waiting here' to get notified."},
                {"title": "Bus Drivers", "content": "Log in with phone number, select assigned bus, and drive safely while the phone streams location quietly in the background."},
                {"title": "Fleet Owners", "content": "Add and manage vehicles, build custom routes, arrange stops in order, and assign drivers to morning and evening shifts."},
                {"title": "Super Administrator", "content": "Oversees the entire platform, verifies new fleet owners, and ensures smooth operation across all routes."}
            ],
            "notes": "Walk through the 4 roles. Highlight that each person gets a dedicated screen customized just for what they need to do, with no unnecessary clutter."
        },
        # Slide 6
        {
            "category": "HOW IT WORKS",
            "title": "The Simple 3-Step Journey",
            "boxes": [
                {"title": "Step 1: Driver Starts Shift", "content": "The driver logs in and presses 'Start Broadcast'. The phone sends its GPS position every 3 seconds to our server."},
                {"title": "Step 2: Smart Server Processes", "content": "The server checks if the bus is near a stop, calculates how fast it is moving, and works out arrival minutes for upcoming stops."},
                {"title": "Step 3: Instant Passenger Update", "content": "Without needing to refresh the page, passengers see the bus pin move on their screen and arrival countdowns tick down."},
                {"title": "Result", "content": "Smooth, instant updates in less than half a second (sub-500ms) with zero manual work from anyone."}
            ],
            "notes": "Keep this slide conversational: Step 1 driver drives, Step 2 server calculates speed and stops, Step 3 passenger sees it instantly. It's that simple."
        },
        # Slide 7
        {
            "category": "PASSENGER EXPERIENCE",
            "title": "Finding Your Bus in 3 Quick Taps",
            "boxes": [
                {"title": "Instant Search", "content": "Type where you are and where you want to go. The system instantly suggests all buses running on that corridor."},
                {"title": "Interactive Live Map", "content": "See clear color-coded markers: Green for Start, Red for Destination, and Blue for the Bus moving along the route line."},
                {"title": "Live Arrival Badges", "content": "Each stop displays a clean badge: 'Arriving in 4 mins', 'Next Stop: Main Gate', so you know exactly when to leave home."},
                {"title": "No Login Required!", "content": "Anyone can view live buses right away without having to create an account or remember passwords. Zero friction!"}
            ],
            "notes": "Point out the user-friendly design: passengers don't need to sign up just to see where the bus is. Anyone can open the link and check immediately."
        },
        # Slide 8
        {
            "category": "INTERACTIVE FEATURE",
            "title": "'I'm Waiting at This Stop!' Feature",
            "boxes": [
                {"title": "One-Tap Wait Token", "content": "When standing at a stop, commuters can tap 'I am waiting here'. The system registers their presence."},
                {"title": "Live Passenger Count", "content": "Bus owners and drivers can see how many passengers are waiting at upcoming stops, helping prevent overcrowded stops."},
                {"title": "Arrival Alert Prompt", "content": "When the bus gets close, a friendly prompt pops up on the commuter's phone: 'Your bus has arrived! Did you board?'"},
                {"title": "Trip History", "content": "Confirmed rides are saved under your personal trip history so you can track your daily travel routines."}
            ],
            "notes": "This is one of the most interactive features in our project. Commuters let the system know they are waiting, and get an automatic pop-up alert the moment the bus pulls in."
        },
        # Slide 9
        {
            "category": "DRIVER SAFETY",
            "title": "Keeping Drivers Focused on the Road",
            "boxes": [
                {"title": "Hands-Free Operation", "content": "Distracted driving causes accidents. Our driver app is designed so the driver never has to look at the screen while driving."},
                {"title": "One Big Button to Start", "content": "Clean, high-contrast buttons designed for easy use in sunlight. Just tap 'Start Shift' and put the phone in the dashboard mount."},
                {"title": "Automatic Stop Progress", "content": "As the bus rolls into each stop, the app recognizes it automatically and updates the route progress hands-free."},
                {"title": "Manual Fallback Included", "content": "If a stop doesn't have GPS coordinates saved, an easy one-tap button allows marking it manually."}
            ],
            "notes": "Emphasize driver safety. Reviewers love practical real-world considerations: by removing screen tapping while driving, our system protects lives."
        },
        # Slide 10
        {
            "category": "SMART INNOVATION",
            "title": "Geofencing Explained: The Invisible Bubble",
            "boxes": [
                {"title": "What is a Geofence?", "content": "Imagine drawing an invisible circle with a 50-meter radius around every bus stop on the map."},
                {"title": "Entering the Circle", "content": "When the bus's GPS enters inside this 50-meter circle, the system recognizes: 'Aha! The bus has reached Stop #3!'"},
                {"title": "Instant Notifications", "content": "Waiting passengers get an arrival chime, and the system automatically shifts focus to Stop #4."},
                {"title": "No Double-Counting", "content": "Even if the bus waits at the stop for 3 minutes, a smart digital lock makes sure the stop is only recorded once."}
            ],
            "notes": "Use the 'invisible bubble' analogy. It explains geofencing in plain English without confusing mathematical jargon."
        },
        # Slide 11
        {
            "category": "SMART INNOVATION",
            "title": "Realistic Arrival Times (Not Guesswork)",
            "boxes": [
                {"title": "Adapts to Real Speed", "content": "Instead of assuming a fixed 30 km/h speed, our system watches how fast the bus is actually moving in traffic right now."},
                {"title": "Traffic Light Filter", "content": "If the bus stops at a red signal, the system doesn't panic or say 'arrival in 99 hours' - it smoothly averages the speed."},
                {"title": "Road Path Calculation", "content": "Measures the actual distance along the route from stop to stop, rather than drawing a misleading straight line across buildings."},
                {"title": "Accurate Countdown", "content": "Arrival minutes update smoothly on the passenger's phone screen every few seconds."}
            ],
            "notes": "Explain how our ETA works like a good navigation app: it understands that traffic changes, so it smooths out speed spikes and red light stops."
        },
        # Slide 12
        {
            "category": "SMART INNOVATION",
            "title": "What Happens at the Final Stop? Auto-Turnaround",
            "boxes": [
                {"title": "The Daily Reality", "content": "A bus doesn't just stop working when it reaches the final station; it turns around and starts the return journey!"},
                {"title": "The Old Hassle", "content": "In traditional systems, the driver or dispatcher has to manually re-select the reverse route on a computer."},
                {"title": "Our Automatic Switch", "content": "The moment the bus pulls into the last stop, our server automatically flips the route into reverse (Destination -> Source)."},
                {"title": "Zero Interruption", "content": "The stop counter resets to #1, and passengers waiting on the return path immediately see the bus approaching."}
            ],
            "notes": "This is a great real-world feature to highlight. Buses run round trips all day, and our system flips the route automatically at the terminal."
        },
        # Slide 13
        {
            "category": "FLEET MANAGEMENT",
            "title": "Fleet Owner Studio: Total Control in One Place",
            "boxes": [
                {"title": "Bus Inventory", "content": "Add new buses with categories (AC, Non-AC, Mini), and mark buses as Active, In Service, or Retired."},
                {"title": "Custom Route Builder", "content": "Create new routes, name intermediate stops, set their correct order, and pinpoint them on the map with a click."},
                {"title": "Driver Assignment", "content": "Assign licensed drivers to specific buses and routes in seconds with simple drop-down menus."},
                {"title": "Live Fleet Oversight", "content": "See which buses are currently moving, who is driving them, and which routes have active trips running."}
            ],
            "notes": "Fleet owners love this because it replaces confusing clipboards and phone calls with one clean, modern dashboard."
        },
        # Slide 14
        {
            "category": "ACCOUNT SAFETY",
            "title": "Simple & Safe Onboarding with Email OTP",
            "boxes": [
                {"title": "Safe Two-Step Signup", "content": "New drivers and owners register with their email and phone number to keep the platform safe from fake accounts."},
                {"title": "Quick 6-Digit Code", "content": "The system automatically emails a 6-digit verification code (powered by Brevo). Enter it to activate your account."},
                {"title": "Anti-Spam Security", "content": "Verification codes expire after 10 minutes, and accounts lock after 5 wrong attempts to stop automated bots."},
                {"title": "Password Protection", "content": "All passwords are cryptographically scrambled (bcrypt) so credentials can never be stolen or read."}
            ],
            "notes": "Explain that user safety is built in from day one. Email OTP verification ensures only real, authorized drivers and owners can access the controls."
        },
        # Slide 15
        {
            "category": "THE ENGINE UNDER THE HOOD",
            "title": "The Technology Behind the App (Made Simple)",
            "boxes": [
                {"title": "React (Frontend)", "content": "Builds the beautiful screens you see. It updates bus positions on the map smoothly without blinking or reloading."},
                {"title": "Node.js (Backend)", "content": "The fast traffic controller that receives GPS coordinates from drivers and calculates stops in milliseconds."},
                {"title": "WebSockets (Live Chat for Data)", "content": "Like an open phone line between the bus and passengers. As soon as the bus moves, the map updates immediately."},
                {"title": "PostgreSQL (Database)", "content": "A rock-solid database that remembers all routes, stops, and historical trips with total reliability."}
            ],
            "notes": "Keep the tech stack explanation simple and visual: React is the face, Node.js is the brain, WebSockets is the live phone line, and PostgreSQL is the memory."
        },
        # Slide 16
        {
            "category": "SMART DECISIONS",
            "title": "Why We Chose Open-Source Maps",
            "table": {
                "headers": ["Feature", "Commercial Maps (e.g. Google)", "Our Choice (OpenStreetMap + Leaflet)"],
                "rows": [
                    ["Usage Cost", "$5 to $30 per 1,000 views (expensive!)", "100% Free & Open-Source (Zero monthly bills)"],
                    ["Credit Card Needed", "Yes, mandatory cloud billing accounts", "No credit cards, completely community-driven"],
                    ["App Weight", "Heavy downloads, slower load times", "Ultra-lightweight (<150KB), loads instantly"],
                    ["Customization", "Strict styling rules and branding", "Full freedom to style bus icons and colors"],
                    ["Ideal For", "Huge multi-national corporations", "Colleges, city councils & independent bus fleets"]
                ]
            },
            "notes": "Reviewers frequently ask about costs. Show them this table to prove that choosing OpenStreetMap and Leaflet makes the project economically sustainable and free forever."
        },
        # Slide 17
        {
            "category": "RELIABILITY",
            "title": "What If the Internet Drops?",
            "boxes": [
                {"title": "Gentle Banner Alert", "content": "If a passenger's connection flickers, a clean yellow banner informs them: 'Reconnecting to live tracking...'"},
                {"title": "Automatic Reconnect", "content": "The system quietly tries to reconnect in the background without forcing the user to close and reopen the app."},
                {"title": "Underpass & Tunnel Shield", "content": "If a driver temporarily loses GPS under a bridge, the app remembers the last known speed and updates smoothly."},
                {"title": "Zero Crash Policy", "content": "Network hiccups are handled gracefully - the screen never goes blank or throws scary code errors."}
            ],
            "notes": "Highlight this practical engineering detail: real mobile networks drop all the time in moving vehicles, and our app is built to handle that gracefully."
        },
        # Slide 18
        {
            "category": "BENCHMARKING",
            "title": "How Does Our Project Compare?",
            "table": {
                "headers": ["Feature", "Paper / Timetable Boards", "Generic Map Apps", "Our Smart Bus Platform"],
                "rows": [
                    ["Live Location", "None (pure guesswork)", "Estimated from crowd data", "Direct live bus GPS stream"],
                    ["Arrival Countdown", "Static estimated times", "Generic traffic estimates", "Adapts to actual bus speed"],
                    ["Driver Safety", "Manual log sheets", "Not designed for drivers", "100% Hands-free auto geofencing"],
                    ["Commuter Demand", "Unknown until bus arrives", "No passenger waiting count", "'Waiting at Stop' live queue"],
                    ["Fleet Control", "Phone calls & paper", "None provided", "Complete Owner control portal"]
                ]
            },
            "notes": "This comparison table shows the reviewer exactly why our project is superior to old paper schedules and generic navigation tools."
        },
        # Slide 19
        {
            "category": "FUTURE VISIONS",
            "title": "Exciting Ideas for the Next Version",
            "boxes": [
                {"title": "Smart Phone Notifications", "content": "Get a lock-screen alert on your phone: 'Your regular bus is 5 minutes away from your stop, time to leave!'"},
                {"title": "Digital UPI Fare Payments", "content": "Scan a quick QR code on the bus screen or buy digital bus passes directly in the app."},
                {"title": "Live Seat Counter", "content": "Connect simple sensors or a doorway camera to show whether the bus has: Empty Seats, Standing Room, or Full."},
                {"title": "AI Traffic Predictions", "content": "Learn from months of trip history to predict that Monday mornings take 8 minutes longer due to market traffic."}
            ],
            "notes": "Share these future ideas with excitement: mobile push notifications, UPI contactless ticketing, seat availability, and AI traffic predictions."
        },
        # Slide 20
        {
            "category": "LIVE DEMONSTRATION",
            "title": "Live Demonstration: See It in Action!",
            "boxes": [
                {"title": "Phase 1: The Fleet Owner", "content": "We will show how an owner logs in, views their active fleet, and sees assigned drivers."},
                {"title": "Phase 2: The Driver", "content": "We will simulate the driver starting the shift and streaming real-time location along the route."},
                {"title": "Phase 3: The Passenger", "content": "We will watch the bus move live across the map, see the arrival minutes count down, and trigger the arrival alert!"},
                {"title": "What to Watch For", "content": "Notice how the map moves smoothly and stops update automatically with zero manual clicking!"}
            ],
            "notes": "Use this slide as your bridge to the live demo. Set the reviewer's expectations clearly so they know exactly what to look for."
        },
        # Slide 21
        {
            "category": "CONCLUSION",
            "title": "Key Takeaways & Summary",
            "boxes": [
                {"title": "Solved Real Commuter Pain", "content": "Eliminated waiting anxiety with accurate, live, sub-second bus tracking on an interactive map."},
                {"title": "Protected Driver Safety", "content": "Engineered automated 50m geofencing so drivers never have to touch a screen while driving."},
                {"title": "Empowered Bus Operators", "content": "Gave fleet owners a digital control room to manage routes, drivers, and schedules efficiently."},
                {"title": "Zero License Costs", "content": "Built on free, open-source mapping technologies that can be deployed anywhere at zero monthly cost."}
            ],
            "notes": "Summarize the four main achievements with confidence. Remind the reviewers that this is a complete, working solution ready for real-world deployment."
        },
        # Slide 22
        {
            "is_title": True,
            "title": "Thank You!\nQuestions & Discussion",
            "subtitle": "We would love to hear your thoughts, feedback, and questions.",
            "meta": [
                "Project: Smart Bus Tracking & Fleet Management System",
                "Ready for Live Demonstration and Q&A",
                "Presented by: [Your Name / Team Names]",
                "Thank you for your time and guidance!"
            ],
            "notes": "Thank the reviewers politely and invite their questions: 'Thank you for your time and attention. We are now ready to demonstrate the live application and welcome your questions.'"
        }
    ]

    for idx, slide_info in enumerate(slides_data):
        slide = prs.slides.add_slide(blank_layout)

        # Speaker notes
        if "notes" in slide_info:
            slide.notes_slide.notes_text_frame.text = slide_info["notes"]

        if slide_info.get("is_title"):
            accent_bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.4))
            accent_bar.fill.solid()
            accent_bar.fill.fore_color.rgb = COLOR_ACCENT
            accent_bar.line.fill.background()

            title_box = slide.shapes.add_textbox(Inches(1.0), Inches(1.5), Inches(11.333), Inches(2.2))
            tf = title_box.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = slide_info["title"]
            p.font.name = "Calibri"
            p.font.size = Pt(36)
            p.font.bold = True
            p.font.color.rgb = COLOR_PRIMARY

            sub_box = slide.shapes.add_textbox(Inches(1.0), Inches(3.9), Inches(11.333), Inches(1.0))
            tf_sub = sub_box.text_frame
            tf_sub.word_wrap = True
            p_sub = tf_sub.paragraphs[0]
            p_sub.text = slide_info["subtitle"]
            p_sub.font.name = "Calibri"
            p_sub.font.size = Pt(20)
            p_sub.font.color.rgb = COLOR_ACCENT

            meta_box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(5.1), Inches(11.333), Inches(1.6))
            meta_box.fill.solid()
            meta_box.fill.fore_color.rgb = COLOR_BG_CARD
            meta_box.line.color.rgb = COLOR_BORDER
            tf_meta = meta_box.text_frame
            tf_meta.word_wrap = True

            for m_idx, meta_item in enumerate(slide_info["meta"]):
                p_meta = tf_meta.paragraphs[0] if m_idx == 0 else tf_meta.add_paragraph()
                p_meta.text = f"•  {meta_item}"
                p_meta.font.name = "Calibri"
                p_meta.font.size = Pt(13)
                p_meta.font.color.rgb = COLOR_TEXT_DARK
                p_meta.font.bold = (m_idx < 2)

        else:
            cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(10), Inches(0.4))
            tf_cat = cat_box.text_frame
            p_cat = tf_cat.paragraphs[0]
            p_cat.text = slide_info.get("category", "PROJECT HIGHLIGHT")
            p_cat.font.name = "Calibri"
            p_cat.font.size = Pt(12)
            p_cat.font.bold = True
            p_cat.font.color.rgb = COLOR_HIGHLIGHT

            title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.7), Inches(11.5), Inches(0.8))
            tf_title = title_box.text_frame
            p_title = tf_title.paragraphs[0]
            p_title.text = slide_info["title"]
            p_title.font.name = "Calibri"
            p_title.font.size = Pt(24)
            p_title.font.bold = True
            p_title.font.color.rgb = COLOR_PRIMARY

            num_box = slide.shapes.add_textbox(Inches(12.0), Inches(0.4), Inches(1.0), Inches(0.4))
            tf_num = num_box.text_frame
            p_num = tf_num.paragraphs[0]
            p_num.text = f"{idx + 1}/22"
            p_num.alignment = PP_ALIGN.RIGHT
            p_num.font.name = "Calibri"
            p_num.font.size = Pt(11)
            p_num.font.bold = True
            p_num.font.color.rgb = COLOR_TEXT_MUTED

            if "boxes" in slide_info:
                boxes = slide_info["boxes"]
                positions = [
                    (Inches(0.8), Inches(1.6)),
                    (Inches(6.8), Inches(1.6)),
                    (Inches(0.8), Inches(4.3)),
                    (Inches(6.8), Inches(4.3))
                ]
                for b_idx, box_data in enumerate(boxes):
                    pos_x, pos_y = positions[b_idx]
                    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, pos_x, pos_y, Inches(5.7), Inches(2.45))
                    card.fill.solid()
                    card.fill.fore_color.rgb = COLOR_BG_CARD
                    card.line.color.rgb = COLOR_BORDER
                    card.line.width = Pt(1)

                    tf_card = card.text_frame
                    tf_card.word_wrap = True
                    tf_card.margin_left = Inches(0.3)
                    tf_card.margin_right = Inches(0.3)
                    tf_card.margin_top = Inches(0.25)
                    tf_card.margin_bottom = Inches(0.2)

                    p_header = tf_card.paragraphs[0]
                    p_header.text = box_data["title"]
                    p_header.font.name = "Calibri"
                    p_header.font.size = Pt(16)
                    p_header.font.bold = True
                    p_header.font.color.rgb = COLOR_ACCENT

                    p_body = tf_card.add_paragraph()
                    p_body.text = box_data["content"]
                    p_body.font.name = "Calibri"
                    p_body.font.size = Pt(13)
                    p_body.font.color.rgb = COLOR_TEXT_DARK
                    p_body.space_before = Pt(8)

            elif "table" in slide_info:
                table_info = slide_info["table"]
                rows_count = len(table_info["rows"]) + 1
                cols_count = len(table_info["headers"])
                table_shape = slide.shapes.add_table(rows_count, cols_count, Inches(0.8), Inches(1.7), Inches(11.7), Inches(5.0))
                tbl = table_shape.table
                tbl.columns[0].width = Inches(2.5)
                tbl.columns[1].width = Inches(4.5)
                tbl.columns[2].width = Inches(4.7)

                for c_idx, h_text in enumerate(table_info["headers"]):
                    cell = tbl.cell(0, c_idx)
                    cell.fill.solid()
                    cell.fill.fore_color.rgb = COLOR_PRIMARY
                    tf_h = cell.text_frame
                    tf_h.word_wrap = True
                    p_h = tf_h.paragraphs[0]
                    p_h.text = h_text
                    p_h.font.name = "Calibri"
                    p_h.font.size = Pt(14)
                    p_h.font.bold = True
                    p_h.font.color.rgb = COLOR_WHITE

                for r_idx, row_data in enumerate(table_info["rows"]):
                    for c_idx, val in enumerate(row_data):
                        cell = tbl.cell(r_idx + 1, c_idx)
                        cell.fill.solid()
                        cell.fill.fore_color.rgb = COLOR_BG_CARD if r_idx % 2 == 0 else COLOR_WHITE
                        tf_c = cell.text_frame
                        tf_c.word_wrap = True
                        p_c = tf_c.paragraphs[0]
                        p_c.text = val
                        p_c.font.name = "Calibri"
                        p_c.font.size = Pt(12)
                        p_c.font.color.rgb = COLOR_TEXT_DARK
                        if c_idx == 0:
                            p_c.font.bold = True

    output_path = "Bus_Tracking_System_Presentation.pptx"
    prs.save(output_path)
    print(f"SUCCESS: Simplified & interactive presentation created at {output_path}")

if __name__ == "__main__":
    create_deck()
