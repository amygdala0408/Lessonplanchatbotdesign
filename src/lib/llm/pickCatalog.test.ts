import { describe, expect, it } from 'vitest';

import { pickCatalog } from './pickCatalog';

describe('pickCatalog text audience filtering', () => {
  it("does not return teacher-PD resources when scope='text'", async () => {
    const result = await pickCatalog({
      scope: 'text',
      limit: 20,
      plan: {
        subject: 'ELA',
        gradeLevel: '9th grade',
        title: 'adolescent literacy practice guide',
        standard: { framework: 'CCSS', code: 'CCSS.ELA-LITERACY.RL.9-10.1' },
      },
      messages: [
        {
          role: 'user',
          content:
            '9th grade ELA, CCSS.ELA-LITERACY.RL.9-10.1, 60 minutes. Need a text students can read.',
        },
      ],
    });

    const choices = result.choices as Array<{ id: string; audience?: string; title: string }>;
    expect(choices).toHaveLength(3);
    expect(choices.every((choice) => choice.audience === 'student')).toBe(true);

    const ids = choices.map((choice) => choice.id);
    expect(ids).not.toContain('wwc_improving_adolescent_literacy_practice_guide');
    expect(ids).not.toContain('wwc_providing_reading_interventions_for_grades_4_9');
    expect(ids).not.toContain('wwc_teaching_secondary_students_to_write_effectively');
    expect(ids).not.toContain('understood_org_teaching_students_with_learning_differences');
    expect(ids).not.toContain('learning_for_justice_social_justice_standards');
  });
});
