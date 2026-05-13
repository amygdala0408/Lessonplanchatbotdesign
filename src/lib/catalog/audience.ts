import type { ResourceRecord, ResourceAudience } from './types';

type ResourceAudienceInput = Pick<
  ResourceRecord,
  'id' | 'title' | 'author' | 'source' | 'subject' | 'url' | 'accessibility'
> & {
  audience?: ResourceAudience;
};

const TEACHER_PD_PATTERNS = [
  /\bpractice guide\b/i,
  /\bprogram guide\b/i,
  /\bschool guide\b/i,
  /\bimplementation\b/i,
  /\bframework\b/i,
  /\bstandards?\b/i,
  /\brubric\b/i,
  /\bprofessional development\b/i,
  /\bteacher(?:'s)? guide\b/i,
  /\bteaching students\b/i,
  /\bteaching strategies\b/i,
  /\bcurriculum\b/i,
  /\bunit(?:s)?\b/i,
  /\bfacilitating\b/i,
  /\bevidence[-\s]?based\b/i,
  /\bvisible learning\b/i,
  /\bhattie\b/i,
  /\bmarzano\b/i,
  /\bwiggins\b/i,
  /\bmctighe\b/i,
  /\bequip\b/i,
  /\bunderstanding by design\b/i,
  /\bwhat works clearinghouse\b/i,
  /\bies\/ncee\b/i,
  /\bcase(?:l)?\b/i,
];

const STUDENT_FACING_OVERRIDES = [
  /\bprimary source\b/i,
  /\bpoems?\b/i,
  /\barticle\b/i,
  /\bclassroom activities\b/i,
  /\bsimulation\b/i,
  /\binteractive\b/i,
  /\blesson downloads?\b/i,
  /\belective course\b/i,
];

export function inferResourceAudience(resource: ResourceAudienceInput): ResourceAudience {
  if (resource.audience === 'student' || resource.audience === 'teacher') {
    return resource.audience;
  }

  const haystack = [
    resource.id,
    resource.title,
    resource.author,
    resource.source,
    resource.subject,
    resource.url,
    resource.accessibility,
  ]
    .filter(Boolean)
    .join(' ');

  const studentOverride = STUDENT_FACING_OVERRIDES.some((pattern) => pattern.test(haystack));
  const teacherPd = TEACHER_PD_PATTERNS.some((pattern) => pattern.test(haystack));

  // A primary-source set from LOC or a classroom activity can live on a teacher
  // URL but still be what students actually read/use. Teacher-PD rows only lose
  // to explicit student-facing signals.
  if (teacherPd && !studentOverride) return 'teacher';
  return 'student';
}

export function isStudentFacingResource(resource: ResourceAudienceInput): boolean {
  return inferResourceAudience(resource) === 'student';
}
