import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const SHOP_ID = '7d914133-a97a-4695-bb21-07320fe8c71d'; // xerox lakshmi

const CUSTOMERS = [
  { name: 'Sai Kiran', phone: '9848022338', ip: '157.48.12.45' },
  { name: 'Priya Sharma', phone: '9440188291', ip: '106.192.4.97' },
  { name: 'Rahul Reddy', phone: '6300286705', ip: '183.82.112.5' },
  { name: 'Ananya Verma', phone: '7013498122', ip: '49.207.214.88' },
  { name: 'Manoj Kumar', phone: '9121844510', ip: '117.216.55.32' },
  { name: 'Divya Sri', phone: '8332990145', ip: '106.192.8.12' },
  { name: 'Karthik Raja', phone: '9989012345', ip: '157.48.99.110' },
  { name: 'Sneha Patel', phone: '9490123456', ip: '49.206.18.77' },
  { name: 'Venkat Rao', phone: '9866543210', ip: '183.83.45.61' },
  { name: 'Lakshmi Prasanna', phone: '8106789012', ip: '117.215.8.94' },
  { name: 'Harish Babu', phone: '9000123456', ip: '106.192.4.150' },
  { name: 'Tejaswini', phone: '7799123456', ip: '157.49.22.80' },
  { name: 'Naveen Chandra', phone: '9550123456', ip: '49.207.199.10' },
  { name: 'Bhavani Shankar', phone: '9177123456', ip: '183.82.77.44' },
  { name: 'Swathi Krishna', phone: '8985123456', ip: '117.216.90.15' },
];

const DOCUMENTS = [
  { name: 'Project_Report_Final.pdf', pages: 18, color: false, doubleSided: true, note: 'Front and back print please' },
  { name: 'Aadhaar_Card_Copy.pdf', pages: 2, color: true, doubleSided: false, note: 'Need clear color print' },
  { name: 'Resume_Updated_2026.pdf', pages: 2, color: false, doubleSided: false, note: 'Bond paper if possible' },
  { name: 'Lab_Manual_ECE_Unit4.pdf', pages: 12, color: false, doubleSided: true, note: 'Leave margin on left' },
  { name: 'Hall_Ticket_Midterm_Exam.pdf', pages: 1, color: true, doubleSided: false, note: 'Urgent for exam' },
  { name: 'Assignment_Unit_3_Submission.pdf', pages: 8, color: false, doubleSided: true, note: '' },
  { name: 'Govt_Application_Certificate.pdf', pages: 4, color: true, doubleSided: false, note: 'Attestation copy' },
  { name: 'Study_Notes_Chapter_5.pdf', pages: 15, color: false, doubleSided: true, note: '' },
  { name: 'College_ID_Proof_Card.pdf', pages: 1, color: true, doubleSided: false, note: 'Lamination needed' },
  { name: 'Seminar_Presentation_Slides.pdf', pages: 10, color: true, doubleSided: false, note: '2 slides per page' },
  { name: 'Passport_Size_Photo_Sheet.pdf', pages: 1, color: true, doubleSided: false, note: 'Glossy paper' },
  { name: 'Internship_Offer_Letter.pdf', pages: 3, color: false, doubleSided: false, note: '' },
  { name: 'GATE_2026_Application_Form.pdf', pages: 5, color: false, doubleSided: true, note: 'Clear barcode needed' },
  { name: 'Math_Formula_Cheat_Sheet.pdf', pages: 4, color: true, doubleSided: true, note: '' },
  { name: 'PAN_Card_Enrolment_Form.pdf', pages: 2, color: false, doubleSided: false, note: '' },
];

const CANCEL_REASONS = [
  'Customer uploaded wrong document',
  'Duplicate order by student',
  'Customer cancelled - will come later',
  'Page format error in submitted file',
  'Student needed black & white instead of color',
];

function generateShortToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate realistic IST peak hours
// IST hours: 9am (03:30 UTC) to 8pm (14:30 UTC)
// Peak hours in IST:
// 09:00 - 11:30 (Morning college rush) -> Weight 4
// 12:30 - 14:00 (Lunch break) -> Weight 3
// 14:30 - 16:30 (Afternoon) -> Weight 2
// 17:00 - 19:30 (Evening college exit / exam prep) -> Weight 5
function getRandomIstHour() {
  const hourWeights = [
    { hour: 9, weight: 6 },
    { hour: 10, weight: 10 },
    { hour: 11, weight: 9 },
    { hour: 12, weight: 7 },
    { hour: 13, weight: 6 },
    { hour: 14, weight: 5 },
    { hour: 15, weight: 5 },
    { hour: 16, weight: 7 },
    { hour: 17, weight: 11 },
    { hour: 18, weight: 12 },
    { hour: 19, weight: 9 },
    { hour: 20, weight: 4 },
  ];
  const totalWeight = hourWeights.reduce((sum, h) => sum + h.weight, 0);
  let randomVal = Math.random() * totalWeight;
  for (const h of hourWeights) {
    if (randomVal < h.weight) return h.hour;
    randomVal -= h.weight;
  }
  return 11;
}

async function seedOrders() {
  console.log('=== Starting Database Seeding for Analytics Charts ===');
  console.log(`Target Shop ID: ${SHOP_ID} ("xerox lakshmi")`);

  // Clean up any test orders if any
  await supabase.from('orders').delete().eq('order_number', 'ORD-261014-9999');

  const ordersToInsert = [];
  let orderSeq = 100;

  // Generate orders from Sept 1, 2026 to Oct 14, 2026 (44 days)
  const startDate = new Date('2026-09-01T00:00:00Z');
  const today = new Date('2026-10-14T12:00:00Z'); // Current simulated time

  const daysDiff = Math.round((today.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  console.log(`Generating orders across ${daysDiff} days (Sept 1, 2026 -> Oct 14, 2026)...`);

  for (let d = 0; d <= daysDiff; d++) {
    const currentDay = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    const isToday = d === daysDiff;
    const isPastRecentWeek = d >= daysDiff - 7;

    // Number of orders per day:
    // Weekend slightly fewer (2-4), weekdays more (4-8), recent days even more active (5-9)
    const dayOfWeek = currentDay.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    let orderCountForDay;
    if (isToday) {
      orderCountForDay = 7; // Today has active orders in various stages!
    } else if (isWeekend) {
      orderCountForDay = Math.floor(Math.random() * 3) + 2; // 2 - 4
    } else if (isPastRecentWeek) {
      orderCountForDay = Math.floor(Math.random() * 4) + 5; // 5 - 8
    } else {
      orderCountForDay = Math.floor(Math.random() * 3) + 3; // 3 - 5
    }

    for (let o = 0; o < orderCountForDay; o++) {
      orderSeq++;
      const orderId = randomUUID();
      const shortToken = generateShortToken();

      const customer = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
      const doc = DOCUMENTS[Math.floor(Math.random() * DOCUMENTS.length)];
      const copies = Math.random() < 0.8 ? 1 : Math.random() < 0.9 ? 2 : 3;
      const isColor = doc.color || Math.random() < 0.35;
      const isDoubleSided = doc.doubleSided && !isColor;
      const pageCount = doc.pages;

      // Price calculation: B&W = ₹3/page (or ₹2 if double-sided), Color = ₹9/page
      const unitRate = isColor ? 9 : isDoubleSided ? 2 : 3;
      const totalAmount = pageCount * copies * unitRate;

      // Pick IST hour and minute
      const istHour = getRandomIstHour();
      const istMinute = Math.floor(Math.random() * 60);
      const istSecond = Math.floor(Math.random() * 60);

      // Convert IST to UTC (subtract 5 hours 30 minutes)
      const createdTime = new Date(currentDay);
      createdTime.setUTCHours(istHour - 5, istMinute - 30, istSecond, 0);

      // Format order number: ORD-YYMMDD-XXXX
      const yStr = String(createdTime.getUTCFullYear()).slice(-2);
      const mStr = String(createdTime.getUTCMonth() + 1).padStart(2, '0');
      const dayStr = String(createdTime.getUTCDate()).padStart(2, '0');
      const orderNumber = `ORD-${yStr}${mStr}${dayStr}-${String(orderSeq).padStart(4, '0')}`;

      // Status assignment
      let status;
      let cancellationReason = null;
      let completedAt = null;
      let cancelledAt = null;
      let acceptedAt = null;
      let printingAt = null;
      let readyAt = null;

      // Realistic turnaround time in minutes (completion duration)
      // 1-5 pages: 3-5 mins; 6-15 pages: 6-12 mins; 16+ pages: 12-22 mins
      const durationMins = pageCount <= 5 ? Math.floor(Math.random() * 3) + 3 :
        pageCount <= 12 ? Math.floor(Math.random() * 5) + 6 :
          Math.floor(Math.random() * 8) + 12;

      if (isToday) {
        // For today Oct 14, provide a balanced spread of ALL statuses so all pie slices exist!
        if (o === 0) {
          status = 'PLACED';
        } else if (o === 1) {
          status = 'ACCEPTED';
          acceptedAt = new Date(createdTime.getTime() + 2 * 60000).toISOString();
        } else if (o === 2) {
          status = 'PRINTING';
          acceptedAt = new Date(createdTime.getTime() + 2 * 60000).toISOString();
          printingAt = new Date(createdTime.getTime() + 4 * 60000).toISOString();
        } else if (o === 3) {
          status = 'READY';
          acceptedAt = new Date(createdTime.getTime() + 1 * 60000).toISOString();
          printingAt = new Date(createdTime.getTime() + 3 * 60000).toISOString();
          readyAt = new Date(createdTime.getTime() + 6 * 60000).toISOString();
        } else if (o === 4) {
          status = 'CANCELLED';
          cancellationReason = CANCEL_REASONS[Math.floor(Math.random() * CANCEL_REASONS.length)];
          cancelledAt = new Date(createdTime.getTime() + 3 * 60000).toISOString();
        } else {
          status = 'COMPLETED';
          acceptedAt = new Date(createdTime.getTime() + 1 * 60000).toISOString();
          printingAt = new Date(createdTime.getTime() + 3 * 60000).toISOString();
          readyAt = new Date(createdTime.getTime() + (durationMins - 1) * 60000).toISOString();
          completedAt = new Date(createdTime.getTime() + durationMins * 60000).toISOString();
        }
      } else {
        // Historical days: 90% completed, 10% cancelled
        if (Math.random() < 0.90) {
          status = 'COMPLETED';
          acceptedAt = new Date(createdTime.getTime() + 1.5 * 60000).toISOString();
          printingAt = new Date(createdTime.getTime() + 3.5 * 60000).toISOString();
          readyAt = new Date(createdTime.getTime() + (durationMins - 1) * 60000).toISOString();
          completedAt = new Date(createdTime.getTime() + durationMins * 60000).toISOString();
        } else {
          status = 'CANCELLED';
          cancellationReason = CANCEL_REASONS[Math.floor(Math.random() * CANCEL_REASONS.length)];
          cancelledAt = new Date(createdTime.getTime() + 3 * 60000).toISOString();
        }
      }

      // Build status history
      const statusHistory = [
        { at: createdTime.toISOString(), status: 'PLACED' },
      ];
      if (acceptedAt) statusHistory.push({ at: acceptedAt, from: 'PLACED', status: 'ACCEPTED' });
      if (printingAt) statusHistory.push({ at: printingAt, from: 'ACCEPTED', status: 'PRINTING' });
      if (readyAt) statusHistory.push({ at: readyAt, from: 'PRINTING', status: 'READY' });
      if (completedAt) statusHistory.push({ at: completedAt, from: 'READY', status: 'COMPLETED' });
      if (cancelledAt) statusHistory.push({ at: cancelledAt, from: 'PLACED', status: 'CANCELLED' });

      const updatedAt = completedAt || cancelledAt || readyAt || printingAt || acceptedAt || createdTime.toISOString();

      const fileSize = (pageCount * (isColor ? 180000 : 75000)) + Math.floor(Math.random() * 50000);

      const fileObj = {
        url: `orders/${orderId}/${doc.name}`,
        name: doc.name,
        size: fileSize,
        color: isColor,
        pages: pageCount,
        copies: copies,
        mimeType: 'application/pdf',
        scanStatus: 'passed',
        doubleSided: isDoubleSided,
        securityStatus: 'passed',
      };

      ordersToInsert.push({
        id: orderId,
        short_token: shortToken,
        order_number: orderNumber,
        shop_id: SHOP_ID,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_phone_verified: true,
        customer_ip: customer.ip,
        file_s3_key: `orders/${orderId}/${doc.name}`,
        file_name: doc.name,
        file_size_bytes: fileSize,
        page_count: pageCount,
        copies: copies,
        is_color: isColor,
        is_double_sided: isDoubleSided,
        notes: doc.note,
        total_amount: totalAmount,
        status: status,
        status_history: statusHistory,
        cancellation_reason: cancellationReason,
        draft_expires_at: null,
        accept_deadline: null,
        pickup_deadline: null,
        file_delete_at: completedAt ? new Date(new Date(completedAt).getTime() + 7 * 86400000).toISOString() : null,
        placed_at: createdTime.toISOString(),
        accepted_at: acceptedAt,
        printing_at: printingAt,
        ready_at: readyAt,
        completed_at: completedAt,
        cancelled_at: cancelledAt,
        created_at: createdTime.toISOString(),
        updated_at: updatedAt,
        files: [fileObj],
        deleted_at: null,
        file_status: 'active',
      });
    }
  }

  console.log(`Generated ${ordersToInsert.length} realistic order records!`);

  // Insert in chunks of 50 to avoid any payload limits
  const chunkSize = 50;
  let insertedCount = 0;
  for (let i = 0; i < ordersToInsert.length; i += chunkSize) {
    const chunk = ordersToInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from('orders').insert(chunk);
    if (error) {
      console.error(`Chunk ${i / chunkSize + 1} insert error:`, error);
      process.exit(1);
    }
    insertedCount += chunk.length;
    console.log(`  Inserted ${insertedCount}/${ordersToInsert.length} orders...`);
  }

  // Update shop total_orders count
  const { count: totalOrdersInDb } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', SHOP_ID);

  await supabase
    .from('shops')
    .update({ total_orders: totalOrdersInDb, updated_at: new Date().toISOString() })
    .eq('id', SHOP_ID);

  console.log(`\n✅ Database seeding complete!`);
  console.log(`Total orders now in database for Xerox Lakshmi: ${totalOrdersInDb}`);
}

seedOrders().catch(console.error);
