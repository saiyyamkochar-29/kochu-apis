import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface RawAge {
  birthdate: string;
  timeZone: string;
}

interface AgeOutput {
  updatedAt: string;
  ageYears: number;
  nextBirthday: string;
  timeToNextBirthday: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
}

/**
 * Calculate age in years based on birthdate
 * Formula: (now - birth) / (365.2425 * 24 * 60 * 60 * 1000)
 */
function calculateAge(birthDate: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - birthDate.getTime();
  const daysPerYear = 365.2425;
  const msPerYear = daysPerYear * 24 * 60 * 60 * 1000;
  return diffMs / msPerYear;
}

/**
 * Get next birthday (next occurrence of birth month/day after now)
 * Returns the date at UTC midnight to ensure correct date in ISO string
 */
function getNextBirthday(birthDate: Date, timeZone: string): Date {
  const now = new Date();
  const currentYear = now.getFullYear();
  // Use UTC methods to extract month/day to avoid timezone issues
  const birthMonth = birthDate.getUTCMonth();
  const birthDay = birthDate.getUTCDate();

  // Create next birthday in current year at UTC midnight
  let nextBirthday = new Date(Date.UTC(currentYear, birthMonth, birthDay, 0, 0, 0, 0));

  // If birthday has already passed this year, use next year
  if (nextBirthday <= now) {
    nextBirthday = new Date(Date.UTC(currentYear + 1, birthMonth, birthDay, 0, 0, 0, 0));
  }

  return nextBirthday;
}

/**
 * Calculate time difference between now and next birthday
 */
function calculateTimeToNextBirthday(nextBirthday: Date): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const now = new Date();
  const diffMs = Math.max(0, nextBirthday.getTime() - now.getTime());

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diffMs % (60 * 1000)) / 1000);

  return { days, hours, minutes, seconds };
}

async function main() {
  const projectRoot = join(__dirname, '../..');
  const rawAgePath = join(projectRoot, 'data/age.raw.json');
  const outputPath = join(projectRoot, 'api/age.json');

  // Read raw age data
  let rawData: RawAge;
  try {
    const rawContent = readFileSync(rawAgePath, 'utf-8');
    rawData = JSON.parse(rawContent);
  } catch (error) {
    console.error(`Failed to read ${rawAgePath}:`, error);
    process.exit(1);
  }

  // Parse birthdate
  let birthDate: Date;
  try {
    birthDate = new Date(rawData.birthdate);
    if (isNaN(birthDate.getTime())) {
      throw new Error('Invalid date');
    }
  } catch (error) {
    console.error(`Invalid birthdate format: ${rawData.birthdate}`);
    process.exit(1);
  }

  // Calculate age in years (rounded to 6 decimals)
  const ageYears = Math.round(calculateAge(birthDate) * 1e6) / 1e6;

  // Get next birthday
  const nextBirthday = getNextBirthday(birthDate, rawData.timeZone);

  // Calculate time to next birthday
  const timeToNextBirthday = calculateTimeToNextBirthday(nextBirthday);

  // Build output object
  const output: AgeOutput = {
    updatedAt: new Date().toISOString(),
    ageYears,
    nextBirthday: nextBirthday.toISOString(),
    timeToNextBirthday,
  };

  // Write output file with 2-space indentation and trailing newline
  const outputJson = JSON.stringify(output, null, 2) + '\n';
  writeFileSync(outputPath, outputJson, 'utf-8');

  console.log(`Successfully generated ${outputPath}`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

