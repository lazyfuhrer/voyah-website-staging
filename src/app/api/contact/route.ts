import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

const CONTACT_SHEETS = ["contact-us_en", "contact-us_ar"] as const;
const TEST_DRIVE_SHEETS = ["book-test-drive-en", "book-test-drive-ar"] as const;

const ALL_SHEETS = [...CONTACT_SHEETS, ...TEST_DRIVE_SHEETS] as const;

const TEST_DRIVE_TZ = "Asia/Riyadh";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ksaYmdNow(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TEST_DRIVE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ksaHmNow(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TEST_DRIVE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  let h = "00";
  let m = "00";
  for (const p of parts) {
    if (p.type === "hour") h = p.value.padStart(2, "0");
    if (p.type === "minute") m = p.value.padStart(2, "0");
  }
  return `${h}:${m}`;
}

function addCalendarYearsYmd(ymd: string, addY: number): string {
  const p = ymd.split("-").map(Number);
  const y = p[0] + addY;
  const mo = p[1];
  const d = p[2];
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const nd = Math.min(d, dim);
  return `${y}-${pad2(mo)}-${pad2(nd)}`;
}

function validateTestDriveKsaSlot(
  dateStr: string,
  timeRaw: unknown
): { ok: true } | { ok: false; error: string } {
  const trimmedDate = dateStr.trim();
  const trimmedTime = (timeRaw ?? "").toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    return { ok: false, error: "Invalid or out-of-range booking date" };
  }
  const minYmd = ksaYmdNow();
  const maxYmd = addCalendarYearsYmd(minYmd, 5);
  if (trimmedDate < minYmd || trimmedDate > maxYmd) {
    return { ok: false, error: "Invalid or out-of-range booking date" };
  }
  const today = ksaYmdNow();
  if (trimmedDate < today) {
    return { ok: false, error: "Booking date cannot be in the past" };
  }
  if (trimmedDate === today) {
    if (!trimmedTime) {
      return {
        ok: false,
        error: "Preferred time is required for same-day bookings",
      };
    }
    if (!/^\d{2}:\d{2}$/.test(trimmedTime)) {
      return { ok: false, error: "Invalid preferred time" };
    }
    const nowHm = ksaHmNow();
    if (trimmedTime < nowHm) {
      return { ok: false, error: "Preferred time cannot be in the past" };
    }
  }
  return { ok: true };
}

function isContactSheet(
  s: string
): s is (typeof CONTACT_SHEETS)[number] {
  return (CONTACT_SHEETS as readonly string[]).includes(s);
}

function isTestDriveSheet(
  s: string
): s is (typeof TEST_DRIVE_SHEETS)[number] {
  return (TEST_DRIVE_SHEETS as readonly string[]).includes(s);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sheet } = body;
    const sheetName = String(sheet ?? "");

    if (!(ALL_SHEETS as readonly string[]).includes(sheetName)) {
      console.log(`POST /api/contact - 400 (invalid sheet)`);
      return NextResponse.json({ error: "Invalid sheet" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let cells: string[];

    if (isContactSheet(sheetName)) {
      const {
        name,
        subject,
        email,
        phone_number: phoneNumberRaw,
        phone: phoneAlt,
        city,
        message,
      } = body;

      const phone_number = phoneNumberRaw ?? phoneAlt;

      if (
        !name?.trim() ||
        !subject?.trim() ||
        !email?.trim() ||
        !phone_number?.trim() ||
        !city?.trim() ||
        !message?.trim()
      ) {
        console.log(`POST /api/contact - 400 (missing fields)`);
        return NextResponse.json(
          { error: "All fields are required" },
          { status: 400 }
        );
      }

      if (!emailRegex.test(String(email).trim())) {
        console.log(`POST /api/contact - 400 (email)`);
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 }
        );
      }

      cells = [
        new Date().toISOString(),
        name.trim(),
        subject.trim(),
        email.trim(),
        phone_number.trim(),
        city.trim(),
        message.trim(),
      ];
    } else if (isTestDriveSheet(sheetName)) {
      const {
        name,
        email,
        phone,
        phone_number: phoneNumberRaw,
        date,
        select_model: selectModel,
        time,
        model,
        vehicle_query_v: vehicleQueryV,
      } = body;

      const phoneVal = (phone ?? phoneNumberRaw ?? "").toString().trim();

      if (!name?.trim() || !email?.trim() || !phoneVal || !date?.trim()) {
        console.log(`POST /api/contact - 400 (test drive missing fields)`);
        return NextResponse.json(
          { error: "All required fields must be filled" },
          { status: 400 }
        );
      }

      if (!emailRegex.test(String(email).trim())) {
        console.log(`POST /api/contact - 400 (email)`);
        return NextResponse.json(
          { error: "Invalid email format" },
          { status: 400 }
        );
      }

      const slotCheck = validateTestDriveKsaSlot(String(date), time);
      if (!slotCheck.ok) {
        console.log(`POST /api/contact - 400 (test drive slot)`);
        return NextResponse.json({ error: slotCheck.error }, { status: 400 });
      }

      cells = [
        new Date().toISOString(),
        name.trim(),
        phoneVal,
        email.trim(),
        date.trim(),
        (time ?? "").toString().trim(),
        (selectModel ?? "").toString().trim(),
        (model ?? "").toString().trim(),
        (vehicleQueryV ?? "").toString().trim(),
      ];
    } else {
      return NextResponse.json({ error: "Invalid sheet" }, { status: 400 });
    }

    const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!credentials || !spreadsheetId) {
      console.log(`POST /api/contact - 500 (config)`);
      return NextResponse.json(
        {
          error:
            "Server configuration error. Please check your environment variables.",
        },
        { status: 500 }
      );
    }

    let auth;
    try {
      const creds = JSON.parse(credentials);
      auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
    } catch {
      console.log(`POST /api/contact - 500 (credentials)`);
      return NextResponse.json(
        { error: "Invalid credentials format" },
        { status: 500 }
      );
    }

    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const allTitles =
      meta.data.sheets
        ?.map((s) => s.properties?.title)
        .filter((t): t is string => typeof t === "string" && t.length > 0) ??
      [];
    const sheetEntry = meta.data.sheets?.find(
      (s) => s.properties?.title === sheetName
    );
    const sheetId = sheetEntry?.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) {
      console.log(`POST /api/contact - 400 (missing worksheet tab)`);
      return NextResponse.json(
        {
          error: `No worksheet named "${sheetName}" in this spreadsheet. Existing tabs: ${allTitles.length ? allTitles.map((t) => JSON.stringify(t)).join(", ") : "(none)"}. Names must match exactly (including hyphens).`,
        },
        { status: 400 }
      );
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            appendCells: {
              sheetId,
              rows: [
                {
                  values: cells.map((text) => ({
                    userEnteredValue: { stringValue: String(text) },
                  })),
                },
              ],
              fields: "userEnteredValue",
            },
          },
        ],
      },
    });

    console.log(`POST /api/contact - 200`);
    return NextResponse.json(
      { message: "Form submitted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.log(`POST /api/contact - 500`);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to submit form. Please try again.",
      },
      { status: 500 }
    );
  }
}
