import type { ResourceRecord, ResourceAudience, ResourceKind } from './types';

type ResourceAudienceInput = Pick<
  ResourceRecord,
  'id' | 'title' | 'author' | 'source' | 'subject' | 'url' | 'accessibility'
> & {
  audience?: ResourceAudience;
};

type ResourceKindInput = ResourceAudienceInput & {
  kind?: ResourceKind;
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
  // Defense-in-depth: any row that escapes `inferResourceKind` with a
  // collection/anthology/database title still gets downgraded to teacher
  // here, so it doesn't sneak past the audience filter and into the picker.
  /\banthology\b/i,
  /\bdatabase\b/i,
  /\barchive\b/i,
];

const STUDENT_FACING_OVERRIDES = [
  /\bpoems?\b/i,
  /\barticle\b/i,
  /\bclassroom activities\b/i,
  /\bsimulation\b/i,
  /\binteractive\b/i,
  /\blesson downloads?\b/i,
  /\belective course\b/i,
];

/* ----------------------------------------------------------------------------
 * Kind inference
 *
 * `inferResourceKind` classifies what KIND of thing a row is, separate from
 * who its audience is. A row can be `audience: 'teacher'` because the
 * teacher uses it as a finding aid, while still being `kind: 'collection'`
 * (a library of student readings to choose from). The picker uses `kind`,
 * not `audience`, to decide what counts as a recommendable student text.
 * --------------------------------------------------------------------------*/

// Browseable libraries / databases / curated sets of resources. Whatever sits
// at the URL is itself NOT a student reading — it's a place to find one.
const COLLECTION_PATTERNS: RegExp[] = [
  /\bcollections?\b/i,
  /\banthologies?\b/i,
  /\barchives?\b/i,
  /\bdatabases?\b/i,
  /\bencyclopedias?\b/i,
  /\bportals?\b/i,
  // "X: Library" / "X Library" / ends with "Library" / "X Library:" prefix
  /:\s*[\w\s'’]*library\b/i,
  /\blibrary\s*$/i,
  /\blibrary\s*:/i,                     // "Jewish Virtual Library: Education"
  /\bvirtual library\b/i,
  /reading\s+passages?\s+library/i,
  // Primary-source SETS (vs. an individual primary source document)
  /\bprimary[-\s]?source\s+sets?\b/i,
  /primary-source-sets/i,
  // Resource hubs / series / platforms / course catalogs
  /\bopencourseware\b/i,
  /\bcourse\s+catalog\b/i,
  /\b(?:resource\s+)?hubs?\b/i,
  /\bseries\b/i,
  /\bplatforms?\b/i,
  /\bcourses\b/i,                       // "Saylor Academy: High School Courses"
  /\blesson\s+plans?\b/i,               // "AAPI History Hub: K-12 Lesson Plans"
  /:\s+resources?\b/i,                  // "Code.org: Resources"
  /:\s+free\s+resources?\b/i,           // "BrainPOP: Free Resources"
  /:\s+lessons?\s+worth/i,              // "TED-Ed: Lessons Worth Sharing"
  /\beducational\s+resources?\b/i,      // "EDSITEment: NEH Educational Resources"
  /\bstudents?\s+resources?\b/i,        // "Stairway to STEM: Autistic Students Resources"
  /\bmedia\s+bias\s+resources?\b/i,     // "AllSides for Schools: Media Bias Resources"
  /\btest\s+prep\b/i,                   // "Khan Academy: Test Prep"
  /\beducation\s+project\b/i,           // "Asian American Education Project"
  /heritage\s+collection/i,             // "Share My Lesson: AANHPI Heritage Collection"
  /\breading\s+passages?\b/i,           // "ReadWorks: K-12 Reading Passages"
  /\barticle[-\s]?a[-\s]?day\b/i,       // "ReadWorks: Article-A-Day"
  /\bstep[-\s]?reads\b/i,               // "ReadWorks: StepReads"
  /\bscaffolded\s+passages?\b/i,        // "(Scaffolded Passages)"
  /\bcurrent\s+events?\s+at\b/i,        // "Newsela: Current Events at Multiple Reading Levels"
  /\brumorguard\b/i,                    // "News Literacy Project: RumorGuard"
];

// Title-only patterns evaluated WITHOUT URL/accessibility tail. Used for
// end-anchored matches that would otherwise misfire on concatenated haystacks.
const COLLECTION_TITLE_PATTERNS: RegExp[] = [
  /\bresources?\s*$/i,                  // title ends with "Resources"
  /\bcollections?\s*$/i,                // title ends with "Collection"
];

// Strong PD / framework / intervention-research signals that override
// everything else. These are teacher-facing reference material.
const TEACHER_REFERENCE_PATTERNS: RegExp[] = [
  /\bpractice guide\b/i,
  /\bprofessional development\b/i,
  /\bteacher(?:'s)? guide\b/i,
  /\bteaching strategies\b/i,
  /\bteaching students\b/i,            // "Teaching Students with Learning Differences"
  /\bvisible learning\b/i,
  /\bhattie\b/i,
  /\bmarzano\b/i,
  /\bwiggins\b/i,
  /\bmctighe\b/i,
  /\bequip\b/i,
  /\bunderstanding by design\b/i,
  /\bwhat works clearinghouse\b/i,
  /\bies\/ncee\b/i,
  /\biris center\b/i,
  /\bintervention central\b/i,
  /\bncii\b/i,
  /\bld(?:[-\s])?online\b/i,
  /\bchadd\b/i,
  /\badditude\b/i,
  /\bautism speaks\b/i,
  /\bautism society\b/i,
  /\bcolor[ií]n colorado\b/i,
  /\bwida\b.*\b(descriptors?|standards?|access)\b/i,
  /\beducator(?:'s|s)?\s+(resources?|materials?|tool ?kit|tools)\b/i,
  /\bteacher(?:'s|s)?\s+(resources?|materials?|tool ?kit|tools)\b/i,
  /\btool\s*kit\b/i,
  /\bfor educators?\b/i,
  /\brti\s+(resources?|overview)\b/i,
  /\bintensive intervention\b/i,
  /\bintervention\s+tools\s+chart\b/i,
  /\bhigh[-\s]?leverage practices\b/i,
  /\bbehavior\s+management\b/i,
  /\blesson plan(?:s)?\s+library\b/i,  // "Share My Lesson" style PD libraries
  /\bteacher.to.teacher\b/i,
  /\bheritage\s+guide\b/i,             // "EDSITEment: ...Heritage Guide" — pacing guides, not student readings
  /\bclassroom\s+strategies\b/i,       // "Reading Rockets: Classroom Strategies"
  /\breading\s+101\b/i,                // "Reading Rockets: Reading 101" — primer for adults
  /\b(?:the\s+)?sift\s+newsletter\b/i, // "News Literacy Project: The Sift Newsletter"
];

// Hands-on tools students actually use during a lesson.
const INTERACTIVE_PATTERNS: RegExp[] = [
  /\bsimulations?\b/i,
  /\bsimulators?\b/i,
  /\binteractives?\b/i,
  /\bphet\b/i,
  /\bdesmos\b/i,
  /\bgeogebra\b/i,
  /\bnearpod\b/i,
  /\bedpuzzle\b/i,
];

export function inferResourceKind(resource: ResourceKindInput): ResourceKind {
  // Honor an explicit value from the source if present.
  if (
    resource.kind === 'student_reading' ||
    resource.kind === 'collection' ||
    resource.kind === 'teacher_reference' ||
    resource.kind === 'interactive'
  ) {
    return resource.kind;
  }

  const title = resource.title || '';
  const haystack = [
    resource.title,
    resource.author,
    resource.source,
    resource.subject,
    resource.url,
    resource.accessibility,
  ]
    .filter(Boolean)
    .join(' ');

  // Order matters. Teacher reference beats everything because it's the
  // hardest signal to undo downstream. Then collections (which often share
  // platform names with single readings). Then interactives. Then default
  // to specific student reading.
  if (TEACHER_REFERENCE_PATTERNS.some((re) => re.test(haystack))) {
    return 'teacher_reference';
  }
  if (
    COLLECTION_PATTERNS.some((re) => re.test(haystack)) ||
    COLLECTION_TITLE_PATTERNS.some((re) => re.test(title))
  ) {
    return 'collection';
  }
  if (INTERACTIVE_PATTERNS.some((re) => re.test(haystack))) {
    return 'interactive';
  }
  return 'student_reading';
}

export function isStudentReading(resource: ResourceKindInput): boolean {
  return inferResourceKind(resource) === 'student_reading';
}

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
