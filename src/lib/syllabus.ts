const SYLLABUS_BASE_URL =
  "https://syllabus.itp.kindai.ac.jp/customer/Form/SY01010.aspx?syllabusno=";

export function buildSyllabusUrl(syllabusId: string | null | undefined) {
  if (!syllabusId) {
    return null;
  }

  return `${SYLLABUS_BASE_URL}${encodeURIComponent(syllabusId)}`;
}