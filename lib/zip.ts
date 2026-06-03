type ZipEntry = {
  path: string;
  data: Buffer | string;
  modifiedAt?: Date;
};

type CentralDirectoryEntry = {
  fileName: Buffer;
  crc32: number;
  size: number;
  localHeaderOffset: number;
  modifiedAt: Date;
};

const crcTable = buildCrcTable();

export function createZip(entries: ZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralEntries: CentralDirectoryEntry[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data, "utf8");
    const fileName = Buffer.from(normalizeZipPath(entry.path), "utf8");
    const modifiedAt = entry.modifiedAt ?? new Date();
    const crc32 = calculateCrc32(data);
    const localHeader = createLocalFileHeader({
      fileName,
      crc32,
      size: data.length,
      modifiedAt,
    });

    localParts.push(localHeader, data);
    centralEntries.push({
      fileName,
      crc32,
      size: data.length,
      localHeaderOffset: offset,
      modifiedAt,
    });
    offset += localHeader.length + data.length;
  });

  const centralParts = centralEntries.map(createCentralDirectoryHeader);
  const centralDirectorySize = centralParts.reduce(
    (sum, part) => sum + part.length,
    0,
  );
  const centralDirectoryOffset = offset;
  const endRecord = createEndOfCentralDirectoryRecord({
    entryCount: centralEntries.length,
    centralDirectorySize,
    centralDirectoryOffset,
  });

  return Buffer.concat([...localParts, ...centralParts, endRecord]);
}

function createLocalFileHeader({
  fileName,
  crc32,
  size,
  modifiedAt,
}: {
  fileName: Buffer;
  crc32: number;
  size: number;
  modifiedAt: Date;
}) {
  const header = Buffer.alloc(30);
  const dosDateTime = toDosDateTime(modifiedAt);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(dosDateTime.time, 10);
  header.writeUInt16LE(dosDateTime.date, 12);
  header.writeUInt32LE(crc32, 14);
  header.writeUInt32LE(size, 18);
  header.writeUInt32LE(size, 22);
  header.writeUInt16LE(fileName.length, 26);
  header.writeUInt16LE(0, 28);

  return Buffer.concat([header, fileName]);
}

function createCentralDirectoryHeader(entry: CentralDirectoryEntry) {
  const header = Buffer.alloc(46);
  const dosDateTime = toDosDateTime(entry.modifiedAt);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(dosDateTime.time, 12);
  header.writeUInt16LE(dosDateTime.date, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.fileName.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.localHeaderOffset, 42);

  return Buffer.concat([header, entry.fileName]);
}

function createEndOfCentralDirectoryRecord({
  entryCount,
  centralDirectorySize,
  centralDirectoryOffset,
}: {
  entryCount: number;
  centralDirectorySize: number;
  centralDirectoryOffset: number;
}) {
  const record = Buffer.alloc(22);

  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralDirectorySize, 12);
  record.writeUInt32LE(centralDirectoryOffset, 16);
  record.writeUInt16LE(0, 20);

  return record;
}

function calculateCrc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];

    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable() {
  const table: number[] = [];

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[index] = crc >>> 0;
  }

  return table;
}

function normalizeZipPath(value: string) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

function toDosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}
