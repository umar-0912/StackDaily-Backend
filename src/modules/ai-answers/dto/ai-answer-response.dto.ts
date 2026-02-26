import { ApiProperty } from '@nestjs/swagger';

export class AiAnswerResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the AI answer',
    example: '665a1b2c3d4e5f6a7b8c9d0e',
  })
  _id: string;

  @ApiProperty({
    description: 'ID of the question this answer belongs to',
    example: '665a1b2c3d4e5f6a7b8c9d0f',
  })
  questionId: string;

  @ApiProperty({
    description: 'AI-generated answer in markdown format',
    example:
      '## Closures in JavaScript\n\nA closure is a function that retains access to its lexical scope...',
  })
  answer: string;

  @ApiProperty({
    description: 'Timestamp when the answer was generated',
    example: '2025-05-30T14:30:00.000Z',
    type: String,
    format: 'date-time',
  })
  generatedAt: Date;

  @ApiProperty({
    description: 'OpenAI model used for generation',
    example: 'gpt-4',
  })
  model: string;

  @ApiProperty({
    description: 'Total token count consumed for generating the answer',
    example: 542,
    required: false,
  })
  tokenCount?: number;
}
