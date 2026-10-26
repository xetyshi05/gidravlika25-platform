import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRequestCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}
