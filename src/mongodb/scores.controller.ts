import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  Search,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ScoresService } from './scores.service';
import { CacheService } from './cache/cache.service';
import { CreateLearnerProfileDto } from './dto/CreateLearnerProfile.dto';
import { AssessmentInputDto } from './dto/AssessmentInput.dto';
import { CreateAssessmentTrackingDto } from './dto/create-assessment-tracking.dto';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { catchError, lastValueFrom, map } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import ta_config from './config/language/ta';
import en_config from './config/language/en';
import { JwtAuthGuard } from 'src/auth/auth.guard';
import {
  ErrorCodes,
  finalizeStandardError,
  getOrCreateRequestId,
  mapAxiosToUpstreamHttpException,
  mapUnknownToHttpException,
} from 'src/common/exceptions/api.exceptions';
import gu_config from './config/language/gu';
import or_config from './config/language/or';
import hi_config from './config/language/hi';
import kn_config from './config/language/kn';
import { isNotEmptyObject } from 'class-validator';
import { splitGraphemes } from "split-graphemes";
import { SessionResult } from 'src/common/enums/scores.enum';

const Public = () => SetMetadata('isPublic', true);
@ApiTags('scores')
@UseGuards(JwtAuthGuard)
@Controller('scores')
export class ScoresController {
  constructor(
    private readonly scoresService: ScoresService,
    private readonly httpService: HttpService,
    private readonly cacheService: CacheService,
  ) { }

  /** Hindi-specific variant — writes to session_summary instead of Score collection. */
  private async persistEmptyAsrLearnerProfileHi(
    userId: string,
    dto: CreateLearnerProfileDto,
    language: string,
    originalText: string,
    createdAt: string,
  ): Promise<void> {
    const sessionData = {
      session_id: dto.session_id,
      sub_session_id: dto.sub_session_id || '',
      contentType: dto.contentType,
      contentId: dto.contentId || '',
      createdAt,
      language,
      original_text: originalText,
      response_text: '',
      construct_text: '',
      feedback: 'Audio not found',
      asrOutput: '',
    };
    try {
      await this.scoresService.createSessionSummary(userId, sessionData);
    } catch (dbError) {
      console.error('Failed to save empty ASR learner profile to DB:', dbError);
    }
  }

  /** Same shape as profanity minimal save — tracks empty ASR for analytics. */
  private async persistEmptyAsrLearnerProfile(
    userId: string,
    dto: CreateLearnerProfileDto,
    language: string,
    originalText: string,
    createdAt: string,
  ): Promise<void> {
    const emptyAsrScoreData = {
      user_id: userId,
      session: {
        session_id: dto.session_id,
        sub_session_id: dto.sub_session_id || '',
        contentType: dto.contentType,
        contentId: dto.contentId || '',
        createdAt,
        language,
        original_text: originalText,
        response_text: '',
        construct_text: '',
        feedback: 'Audio not found',
        asrOutput: '',
      },
    };
    try {
      await this.scoresService.create(emptyAsrScoreData);
    } catch (dbError) {
      console.error('Failed to save empty ASR learner profile to DB:', dbError);
    }
  }

  @ApiBody({
    description: 'Request body for storing Tamil language learner profile data. Processes audio through ASR and evaluates pronunciation accuracy.',
    schema: {
      type: 'object',
      properties: {
        original_text: {
          type: 'string',
          example: 'நேர்மை நிறைந்த தீர்ப்பு',
          description: 'The original Tamil text that the learner is attempting to read',
        },
        audio: {
          type: 'string',
          example: 'base64_encoded_audio_string',
          description: 'Base64 encoded WAV audio file of the learner reading the text',
        },
        session_id: {
          type: 'string',
          example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6',
          description: 'Unique session identifier',
        },
        language: {
          type: 'string',
          example: 'ta',
          description: 'Language code (ta for Tamil)',
        },
        date: {
          type: 'string',
          format: 'date-time',
          example: '2024-05-07T12:24:51.779Z',
          description: 'Timestamp of the recording',
        },
        sub_session_id: {
          type: 'string',
          example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe',
          description: 'Unique sub-session identifier for grouping related attempts',
        },
        contentId: {
          type: 'string',
          example: 'b70af0e5-0d74-4287-9548-4d491c714b0d',
          description: 'Unique identifier for the content being practiced',
        },
        contentType: {
          type: 'string',
          example: 'Sentence',
          description: 'Type of content (Char, Word, Sentence, Paragraph)',
        },
        mode: {
          type: 'string',
          example: 'online',
          description: 'Processing mode (online/offline)',
        },
      },
      required: ['original_text', 'session_id', 'sub_session_id', 'contentId', 'contentType'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Successfully processed and stored learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'நீர்மை நிறந்த தீரு', description: 'ASR recognized text' },
        subsessionTargetsCount: { type: 'number', example: 17, description: 'Number of target characters in sub-session' },
        subsessionFluency: { type: 'number', example: 1.54, description: 'Fluency score for the sub-session' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while processing or storing learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Update learner profile for Tamil language',
    description: 'Processes audio input through ASR (Automatic Speech Recognition) for Tamil language, evaluates pronunciation accuracy, calculates character-level scores, and stores the results in the learner profile. Supports both online and offline processing modes.',
  })
  @Post('/updateLearnerProfile/ta')
  async updateLearnerProfileTa(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      const vowelSignArr = ta_config.vowel;
      const language = ta_config.language_code;
      const mode = CreateLearnerProfileDto.mode;

      let createScoreData;

      let constructTokenArr = [];
      let correctTokens = [];
      let missingTokens = [];

      let reptitionCount = 0;

      let confidence_scoresArr = [];
      let missing_token_scoresArr = [];
      let anomaly_scoreArr = [];

      const originalText = CreateLearnerProfileDto.original_text;
      let originalTokenArr = await this.scoresService.getSyllablesFromString(
        originalText,
        vowelSignArr,
        language,
      );

      let createdAt = new Date().toISOString().replace('Z', '+00:00');
      let ansSelectionStatus = CreateLearnerProfileDto.ansSelectionStatus;
      let responseText = '';
      let constructText = '';

      let pause_count = 0;
      let avg_pause = 0;

      let pitch_classification = '';
      let pitch_mean = 0;
      let pitch_std = 0;
      let intensity_classification = '';
      let intensity_mean = 0;
      let intensity_std = 0;
      let expression_classification = '';
      let smoothness_classification = '';
      let feedback = '';

      /* Condition to check whether content type is char or not. If content type is char
      dont process it from ASR and other processing related with text evalution matrices and scoring mechanism
      */
      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== 'char') {
        let audioFile;

        if (mode == 'online' || mode == undefined) {
          if (
            CreateLearnerProfileDto['output'] === undefined &&
            CreateLearnerProfileDto.audio !== undefined
          ) {
            audioFile = CreateLearnerProfileDto.audio;
            const decoded = audioFile.toString('base64');

            // Send Audio file to ASR to process and provide vector with char and score
            let audioOutput = await this.scoresService.audioFileToAsrOutput(
              decoded,
              CreateLearnerProfileDto.language,
              CreateLearnerProfileDto['contentType'],
            );

            CreateLearnerProfileDto['output'] = audioOutput.asrOutBeforeDenoised?.output || '';
            pause_count = audioOutput.pause_count || 0;
            avg_pause = audioOutput.avg_pause;
            pitch_classification = audioOutput.pitch_classification;
            pitch_mean = audioOutput.pitch_mean;
            pitch_std = audioOutput.pitch_std;
            intensity_classification = audioOutput.intensity_classification;
            intensity_mean = audioOutput.intensity_mean;
            intensity_std = audioOutput.intensity_std;
            expression_classification = audioOutput.expression_classification;
            smoothness_classification = audioOutput.smoothness_classification;

            if (CreateLearnerProfileDto.output[0].source === '') {
              await this.persistEmptyAsrLearnerProfile(
                user_id,
                CreateLearnerProfileDto,
                language,
                originalText,
                createdAt,
              );
              throw new BadRequestException({
                code: ErrorCodes.BAD_REQUEST,
                message:
                  'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
              });
            }
          }
          responseText = CreateLearnerProfileDto.output[0].source;
        } else {
          responseText = CreateLearnerProfileDto.response_text;
          pause_count = CreateLearnerProfileDto.pause_count;
        }

        // Profanity Detection logic - Check BEFORE any further processing
        try {
          const badWordResponse = await this.scoresService.checkProfanity(responseText, language);
          if (badWordResponse) {
            feedback = 'profanity detected';
            console.warn('Profanity detected for user:', user_id, 'session:', CreateLearnerProfileDto.session_id);

            // Create minimal data object
            const profanityScoreData = {
              user_id: user_id,
              session: {
                session_id: CreateLearnerProfileDto.session_id,
                sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
                contentType: CreateLearnerProfileDto.contentType,
                contentId: CreateLearnerProfileDto.contentId || '',
                createdAt: createdAt,
                language: language,
                original_text: originalText,
                response_text: '***',
                construct_text: '***',
                feedback: feedback,
                asrOutput: '***',
              },
            };

            try {
              await this.scoresService.create(profanityScoreData);
            } catch (dbError) {
              console.error('Failed to save profanity data to DB:', dbError);
            }

            return response.status(HttpStatus.CREATED).send({
              status: 'success',
              msg: 'Data stored with profanity detected',
              originalText: originalText,
              responseText: '***',
              feedback: feedback,
            });
          }
        } catch (profanityCheckError) {
          console.error('Profanity check failed:', profanityCheckError);
        }

        // add the vocabulary logic
        try {
          await this.scoresService.vocabularyCount(
            user_id,
            originalText,
            responseText,
            language,
            CreateLearnerProfileDto.session_id,
            CreateLearnerProfileDto.sub_session_id
          );
        } catch (vocabError) {
          console.error('Vocabulary count failed:', vocabError);
        }

        // Get All hexcode for this selected language
        const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(
          language,
        );
        // End Get All hexcode for this selected language

        // Constructed Logic starts from here
        let constructedTextRepCountData =
          await this.scoresService.getConstructedText(
            originalText,
            responseText,
          );
        constructText = constructedTextRepCountData.constructText;
        reptitionCount = constructedTextRepCountData.reptitionCount;
        constructTokenArr = await this.scoresService.getSyllablesFromString(
          constructText,
          vowelSignArr,
          language,
        );
        // End Constructed Text Logic

        // Comparison Logic for identify correct and missing tokens
        for (const originalTokenArrEle of originalTokenArr) {
          if (constructTokenArr.includes(originalTokenArrEle)) {
            correctTokens.push(originalTokenArrEle);
          } else {
            missingTokens.push(originalTokenArrEle);
          }
        }
        const missingTokenSet = new Set(missingTokens);
        missingTokens = Array.from(missingTokenSet);
        // End Comparison Logic for identify correct and missing tokens

        let identifyTokens = await this.scoresService.identifyTokens(
          CreateLearnerProfileDto.output[0].nBestTokens,
          correctTokens,
          missingTokens,
          tokenHexcodeDataArr,
          vowelSignArr,
        );

        confidence_scoresArr = identifyTokens.confidence_scoresArr;
        missing_token_scoresArr = identifyTokens.missing_token_scoresArr;
        anomaly_scoreArr = identifyTokens.anomaly_scoreArr;

        const textEvalMatrices = await this.scoresService.getTextMetrics(
          originalText,
          constructText,
          language,
          CreateLearnerProfileDto.audio.toString('base64'),
        );
        let tempo_classification = textEvalMatrices.tempo_classification;
        let pause_count_textEval = textEvalMatrices.pause_count;
        let words_per_minute = textEvalMatrices.words_per_minute;
        let rate_classification = textEvalMatrices.rate_classification;

        let fluencyScore = await this.scoresService.getCalculatedFluency(
          textEvalMatrices,
          reptitionCount,
          originalText,
          responseText,
          pause_count,
        );

        let accuracy_classification =
          this.scoresService.getAccuracyClassification(
            CreateLearnerProfileDto.contentType,
            fluencyScore,
          );

        createScoreData = {
          user_id: user_id, // userid sent by client
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '', // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || '', // contentId of original text content shown to user to speak
            createdAt: createdAt,
            language: language, // content language
            original_text: CreateLearnerProfileDto.original_text, // content text shown to speak
            response_text: responseText, // text return by ai after converting audio to text
            construct_text: constructText, // this will be constructed by matching response text with original text.
            confidence_scores: confidence_scoresArr, // confidence score array will include char's has identified by ai and has score
            anamolydata_scores: anomaly_scoreArr, // this char's recognise as noise in audio
            missing_token_scores: missing_token_scoresArr, // this char's missed to spoke or recognise by ai
            read_duration: CreateLearnerProfileDto.read_duration, // This is for cal the fluency duration.
            practice_duration: CreateLearnerProfileDto.practice_duration,
            retry_count: CreateLearnerProfileDto.retry_count,
            error_rate: {
              character: textEvalMatrices.cer,
              word: textEvalMatrices.wer,
            },
            count_diff: {
              character: Math.abs(
                CreateLearnerProfileDto.original_text.length -
                responseText.length,
              ),
              word: Math.abs(
                CreateLearnerProfileDto.original_text.split(' ').length -
                responseText.split(' ').length,
              ),
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length,
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length,
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length,
              },
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: pause_count,
            },
            prosody_fluency: {
              pitch: {
                pitch_classification: pitch_classification,
                pitch_mean: pitch_mean,
                pitch_std: pitch_std,
              },
              intensity: {
                intensity_classification: intensity_classification,
                intensity_mean: intensity_mean,
                intensity_std: intensity_std,
              },
              tempo: {
                tempo_classification: tempo_classification,
                words_per_minute: words_per_minute,
                pause_count: pause_count_textEval,
              },
              expression_classification: expression_classification,
              smoothness: {
                smoothness_classification: smoothness_classification,
                pause_count: pause_count,
                avg_pause: avg_pause,
              },
              rate: {
                rate_classification: rate_classification,
                words_per_minute: words_per_minute,
              },
              accuracy: {
                accuracy_classification: accuracy_classification,
                fluencyScore: fluencyScore.toFixed(3),
              },
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false,
          },
        };

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);
      } else {
        createScoreData = {
          user_id: user_id,
          session: {
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || '',
            createdAt: createdAt,
            language: language,
            original_text: originalText,
            response_text: responseText,
            ansSelectionStatus: ansSelectionStatus,
          },
        };

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);

      }

      // All 3 post-save queries are independent — run in parallel
      let [targets, originalTextSyllables, fluency] = await Promise.all([
        this.scoresService.getTargetsBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
        this.scoresService.getSubsessionOriginalTextSyllables(user_id, CreateLearnerProfileDto.sub_session_id),
        this.scoresService.getFluencyBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
      ]);
      targets = targets.filter((targetsEle) => originalTextSyllables.includes(targetsEle.character));
      const totalTargets = targets.length;

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
        ansSelectionStatus: ansSelectionStatus ? ansSelectionStatus : {}
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for storing Gujarati language learner profile data. Processes audio through ASR and evaluates pronunciation accuracy.',
    schema: {
      type: 'object',
      properties: {
        original_text: {
          type: 'string',
          example: 'ગોલુને ફરવુ ગમે છે.',
          description: 'The original Gujarati text that the learner is attempting to read',
        },
        audio: {
          type: 'string',
          example: 'base64_encoded_audio_string',
          description: 'Base64 encoded WAV audio file of the learner reading the text',
        },
        session_id: {
          type: 'string',
          example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6',
          description: 'Unique session identifier',
        },
        language: {
          type: 'string',
          example: 'gu',
          description: 'Language code (gu for Gujarati)',
        },
        date: {
          type: 'string',
          format: 'date-time',
          example: '2024-05-07T12:24:51.779Z',
          description: 'Timestamp of the recording',
        },
        sub_session_id: {
          type: 'string',
          example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe',
          description: 'Unique sub-session identifier for grouping related attempts',
        },
        contentId: {
          type: 'string',
          example: 'b70af0e5-0d74-4287-9548-4d491c714b0d',
          description: 'Unique identifier for the content being practiced',
        },
        contentType: {
          type: 'string',
          example: 'Sentence',
          description: 'Type of content (Char, Word, Sentence, Paragraph)',
        },
        mode: {
          type: 'string',
          example: 'online',
          description: 'Processing mode (online/offline)',
        },
      },
      required: ['original_text', 'session_id', 'sub_session_id', 'contentId', 'contentType'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Successfully processed and stored learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'ગોલુને ફરવુ ગમે', description: 'ASR recognized text' },
        subsessionTargetsCount: { type: 'number', example: 17, description: 'Number of target characters in sub-session' },
        subsessionFluency: { type: 'number', example: 1.54, description: 'Fluency score for the sub-session' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while processing or storing learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Update learner profile for Gujarati language',
    description: 'Processes audio input through ASR (Automatic Speech Recognition) for Gujarati language, evaluates pronunciation accuracy, calculates character-level scores, and stores the results in the learner profile. Supports both online and offline processing modes.',
  })
  @Post('/updateLearnerProfile/gu')
  async updateLearnerProfileGu(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      const vowelSignArr = gu_config.vowel;
      const language = gu_config.language_code;
      let createScoreData;

      let constructTokenArr = [];
      let correctTokens = [];
      let missingTokens = [];

      let reptitionCount = 0;

      let confidence_scoresArr = [];
      let missing_token_scoresArr = [];
      let anomaly_scoreArr = [];

      var originalText = CreateLearnerProfileDto.original_text;

      if (originalText.endsWith('.')) {
        originalText = originalText.slice(0, -1);
      }

      let originalTokenArr = await this.scoresService.getSyllablesFromString(
        originalText,
        vowelSignArr,
        language,
      );
      let createdAt = new Date().toISOString().replace('Z', '+00:00');
      let ansSelectionStatus = CreateLearnerProfileDto.ansSelectionStatus;

      let responseText = '';
      let constructText = '';

      let pause_count = 0;
      let avg_pause = 0;

      let pitch_classification = '';
      let pitch_mean = 0;
      let pitch_std = 0;
      let intensity_classification = '';
      let intensity_mean = 0;
      let intensity_std = 0;
      let expression_classification = '';
      let smoothness_classification = '';
      let feedback = '';

      /* Condition to check whether content type is char or not. If content type is char
      dont process it from ASR and other processing related with text evalution matrices and scoring mechanism
      */
      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== 'char') {
        let audioFile;

        if (
          CreateLearnerProfileDto['output'] === undefined &&
          CreateLearnerProfileDto.audio !== undefined
        ) {
          audioFile = CreateLearnerProfileDto.audio;
          const decoded = audioFile.toString('base64');

          // Send Audio file to ASR to process and provide vector with char and score
          let audioOutput = await this.scoresService.audioFileToAsrOutput(
            decoded,
            CreateLearnerProfileDto.language,
            CreateLearnerProfileDto['contentType'],
          );

          CreateLearnerProfileDto['output'] = audioOutput.asrOutBeforeDenoised?.output || '';
          pause_count = audioOutput.pause_count || 0;
          avg_pause = audioOutput.avg_pause;
          pitch_classification = audioOutput.pitch_classification;
          pitch_mean = audioOutput.pitch_mean;
          pitch_std = audioOutput.pitch_std;
          intensity_classification = audioOutput.intensity_classification;
          intensity_mean = audioOutput.intensity_mean;
          intensity_std = audioOutput.intensity_std;
          expression_classification = audioOutput.expression_classification;
          smoothness_classification = audioOutput.smoothness_classification;

          if (CreateLearnerProfileDto.output[0].source === '') {
            await this.persistEmptyAsrLearnerProfile(
              user_id,
              CreateLearnerProfileDto,
              language,
              originalText,
              createdAt,
            );
            throw new BadRequestException({
              code: ErrorCodes.BAD_REQUEST,
              message:
                'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
            });
          }
        }

        responseText = CreateLearnerProfileDto.output[0].source;

        // Profanity Detection logic - Check BEFORE any further processing
        try {
          const badWordResponse = await this.scoresService.checkProfanity(responseText, language);
          if (badWordResponse) {
            feedback = 'profanity detected';
            console.warn('Profanity detected for user:', user_id, 'session:', CreateLearnerProfileDto.session_id);

            // Create minimal data object
            const profanityScoreData = {
              user_id: user_id,
              session: {
                session_id: CreateLearnerProfileDto.session_id,
                sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
                contentType: CreateLearnerProfileDto.contentType,
                contentId: CreateLearnerProfileDto.contentId || '',
                createdAt: createdAt,
                language: language,
                original_text: originalText,
                response_text: '***',
                construct_text: '***',
                feedback: feedback,
                asrOutput: '***',
              },
            };

            try {
              await this.scoresService.create(profanityScoreData);
            } catch (dbError) {
              console.error('Failed to save profanity data to DB:', dbError);
            }

            return response.status(HttpStatus.CREATED).send({
              status: 'success',
              msg: 'Data stored with profanity detected',
              originalText: originalText,
              responseText: '***',
              feedback: feedback,
            });
          }
        } catch (profanityCheckError) {
          console.error('Profanity check failed:', profanityCheckError);
        }

        // add the vocabulary logic
        try {
          await this.scoresService.vocabularyCount(
            user_id,
            originalText,
            responseText,
            language,
            CreateLearnerProfileDto.session_id,
            CreateLearnerProfileDto.sub_session_id
          );
        } catch (vocabError) {
          console.error('Vocabulary count failed:', vocabError);
        }

        // Get All hexcode for this selected language
        const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(
          language,
        );

        // Constructed Logic starts from here
        let constructedTextRepCountData =
          await this.scoresService.getConstructedText(
            originalText,
            responseText,
          );
        constructText = constructedTextRepCountData.constructText;

        reptitionCount = constructedTextRepCountData.reptitionCount;
        constructTokenArr = await this.scoresService.getSyllablesFromString(
          constructText,
          vowelSignArr,
          language,
        );

        // Comparison Logic for identify correct and missing tokens
        for (const originalTokenArrEle of originalTokenArr) {
          if (constructTokenArr.includes(originalTokenArrEle)) {
            correctTokens.push(originalTokenArrEle);
          } else {
            missingTokens.push(originalTokenArrEle);
          }
        }
        const missingTokenSet = new Set(missingTokens);
        missingTokens = Array.from(missingTokenSet);

        let identifyTokens = await this.scoresService.identifyTokens(
          CreateLearnerProfileDto.output[0].nBestTokens,
          correctTokens,
          missingTokens,
          tokenHexcodeDataArr,
          vowelSignArr,
        );

        confidence_scoresArr = identifyTokens.confidence_scoresArr;
        missing_token_scoresArr = identifyTokens.missing_token_scoresArr;
        anomaly_scoreArr = identifyTokens.anomaly_scoreArr;

        // Send a call to text eval serivce
        const textEvalMatrices = await this.scoresService.getTextMetrics(
          originalText,
          constructText,
          language,
          CreateLearnerProfileDto.audio.toString('base64'),
        );
        let tempo_classification = textEvalMatrices.tempo_classification;
        let pause_count_textEval = textEvalMatrices.pause_count;
        let words_per_minute = textEvalMatrices.words_per_minute;
        let rate_classification = textEvalMatrices.rate_classification;

        // calculate fluencyScore
        let fluencyScore = await this.scoresService.getCalculatedFluency(
          textEvalMatrices,
          reptitionCount,
          originalText,
          responseText,
          pause_count,
        );

        let accuracy_classification =
          this.scoresService.getAccuracyClassification(
            CreateLearnerProfileDto.contentType,
            fluencyScore,
          );

        createScoreData = {
          user_id: user_id, // userid sent by client
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '', // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || '', // contentId of original text content shown to user to speak
            createdAt: createdAt,
            language: language, // content language
            original_text: CreateLearnerProfileDto.original_text, // content text shown to speak
            response_text: responseText, // text return by ai after converting audio to text
            construct_text: constructText, // this will be constructed by matching response text with original text.
            confidence_scores: confidence_scoresArr, // confidence score array will include char's has identified by ai and has score
            anamolydata_scores: anomaly_scoreArr, // this char's recognise as noise in audio
            missing_token_scores: missing_token_scoresArr, // this char's missed to spoke or recognise by ai
            read_duration: CreateLearnerProfileDto.read_duration, // This is for cal the fluency duration.
            practice_duration: CreateLearnerProfileDto.practice_duration,
            retry_count: CreateLearnerProfileDto.retry_count,
            error_rate: {
              character: textEvalMatrices.cer,
              word: textEvalMatrices.wer,
            },
            count_diff: {
              character: Math.abs(
                CreateLearnerProfileDto.original_text.length -
                CreateLearnerProfileDto.output[0].source.length,
              ),
              word: Math.abs(
                CreateLearnerProfileDto.original_text.split(' ').length -
                CreateLearnerProfileDto.output[0].source.split(' ').length,
              ),
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length,
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length,
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length,
              },
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: pause_count,
            },
            prosody_fluency: {
              pitch: {
                pitch_classification: pitch_classification,
                pitch_mean: pitch_mean,
                pitch_std: pitch_std,
              },
              intensity: {
                intensity_classification: intensity_classification,
                intensity_mean: intensity_mean,
                intensity_std: intensity_std,
              },
              tempo: {
                tempo_classification: tempo_classification,
                words_per_minute: words_per_minute,
                pause_count: pause_count_textEval,
              },
              expression_classification: expression_classification,
              smoothness: {
                smoothness_classification: smoothness_classification,
                pause_count: pause_count,
                avg_pause: avg_pause,
              },
              rate: {
                rate_classification: rate_classification,
                words_per_minute: words_per_minute,
              },
              accuracy: {
                accuracy_classification: accuracy_classification,
                fluencyScore: fluencyScore.toFixed(3),
              },
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false,
          },
        };

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);
      } else {
        createScoreData = {
          user_id: user_id,
          session: {
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || '',
            createdAt: createdAt,
            language: language,
            original_text: originalText,
            response_text: responseText,
            ansSelectionStatus: ansSelectionStatus,
          },
        };

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);

      }

      // All 3 post-save queries are independent — run in parallel
      let [targets, originalTextSyllables, fluency] = await Promise.all([
        this.scoresService.getTargetsBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
        this.scoresService.getSubsessionOriginalTextSyllables(user_id, CreateLearnerProfileDto.sub_session_id),
        this.scoresService.getFluencyBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
      ]);
      targets = targets.filter((targetsEle) => originalTextSyllables.includes(targetsEle.character));
      const totalTargets = targets.length;

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        originalText: originalText,
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
        ansSelectionStatus: ansSelectionStatus ? ansSelectionStatus : {}
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for storing Odia language learner profile data. Processes audio through ASR and evaluates pronunciation accuracy.',
    schema: {
      type: 'object',
      properties: {
        original_text: {
          type: 'string',
          example: 'ବିଲେଇ',
          description: 'The original Odia text that the learner is attempting to read',
        },
        audio: {
          type: 'string',
          example: 'base64_encoded_audio_string',
          description: 'Base64 encoded WAV audio file of the learner reading the text',
        },
        session_id: {
          type: 'string',
          example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6',
          description: 'Unique session identifier',
        },
        language: {
          type: 'string',
          example: 'or',
          description: 'Language code (or for Odia)',
        },
        date: {
          type: 'string',
          format: 'date-time',
          example: '2024-05-07T12:24:51.779Z',
          description: 'Timestamp of the recording',
        },
        sub_session_id: {
          type: 'string',
          example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe',
          description: 'Unique sub-session identifier for grouping related attempts',
        },
        contentId: {
          type: 'string',
          example: 'b70af0e5-0d74-4287-9548-4d491c714b0d',
          description: 'Unique identifier for the content being practiced',
        },
        contentType: {
          type: 'string',
          example: 'Word',
          description: 'Type of content (Char, Word, Sentence, Paragraph)',
        },
        mode: {
          type: 'string',
          example: 'online',
          description: 'Processing mode (online/offline)',
        },
      },
      required: ['original_text', 'session_id', 'sub_session_id', 'contentId', 'contentType'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Successfully processed and stored learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'ବିଲେଇ', description: 'ASR recognized text' },
        subsessionTargetsCount: { type: 'number', example: 17, description: 'Number of target characters in sub-session' },
        subsessionFluency: { type: 'number', example: 1.54, description: 'Fluency score for the sub-session' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while processing or storing learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Update learner profile for Odia language',
    description: 'Processes audio input through ASR (Automatic Speech Recognition) for Odia language, evaluates pronunciation accuracy, calculates character-level scores, and stores the results in the learner profile. Supports both online and offline processing modes.',
  })
  @Post('/updateLearnerProfile/or')
  async updateLearnerProfileOr(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      const vowelSignArr = or_config.vowel;
      const language = or_config.language_code;

      let createScoreData;

      let constructTokenArr = [];
      let correctTokens = [];
      let missingTokens = [];

      let reptitionCount = 0;

      let confidence_scoresArr = [];
      let missing_token_scoresArr = [];
      let anomaly_scoreArr = [];

      const originalText = CreateLearnerProfileDto.original_text;

      let originalTokenArr = await this.scoresService.getSyllablesFromString(
        originalText,
        vowelSignArr,
        language,
      );

      let createdAt = new Date().toISOString().replace('Z', '+00:00');
      let ansSelectionStatus = CreateLearnerProfileDto.ansSelectionStatus;

      let responseText = '';
      let constructText = '';

      let pause_count = 0;
      let avg_pause = 0;

      let pitch_classification = '';
      let pitch_mean = 0;
      let pitch_std = 0;
      let intensity_classification = '';
      let intensity_mean = 0;
      let intensity_std = 0;
      let expression_classification = '';
      let smoothness_classification = '';
      let feedback = '';

      /* Condition to check whether content type is char or not. If content type is char
      dont process it from ASR and other processing related with text evalution matrices and scoring mechanism
      */
      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== 'char') {
        let audioFile;

        if (
          CreateLearnerProfileDto['output'] === undefined &&
          CreateLearnerProfileDto.audio !== undefined
        ) {
          audioFile = CreateLearnerProfileDto.audio;
          const decoded = audioFile.toString('base64');

          // Send Audio file to ASR to process and provide vector with char and score
          let audioOutput = await this.scoresService.audioFileToAsrOutput(
            decoded,
            CreateLearnerProfileDto.language,
            CreateLearnerProfileDto['contentType'],
          );

          CreateLearnerProfileDto['output'] = audioOutput.asrOutBeforeDenoised?.output || '';
          pause_count = audioOutput.pause_count || 0;
          avg_pause = audioOutput.avg_pause;
          pitch_classification = audioOutput.pitch_classification;
          pitch_mean = audioOutput.pitch_mean;
          pitch_std = audioOutput.pitch_std;
          intensity_classification = audioOutput.intensity_classification;
          intensity_mean = audioOutput.intensity_mean;
          intensity_std = audioOutput.intensity_std;
          expression_classification = audioOutput.expression_classification;
          smoothness_classification = audioOutput.smoothness_classification;

          if (CreateLearnerProfileDto.output[0].source === '') {
            await this.persistEmptyAsrLearnerProfile(
              user_id,
              CreateLearnerProfileDto,
              language,
              originalText,
              createdAt,
            );
            throw new BadRequestException({
              code: ErrorCodes.BAD_REQUEST,
              message:
                'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
            });
          }
        }

        responseText = CreateLearnerProfileDto.output[0].source;

        // add the vocabulary logic
        const vocabulary = await this.scoresService.vocabularyCount(
          user_id,
          originalText,
          responseText,
          language,
          CreateLearnerProfileDto.session_id,
          CreateLearnerProfileDto.sub_session_id
        )

        const badWordResponse = await this.scoresService.checkProfanity(responseText, language)
        if (badWordResponse) {
          throw new BadRequestException({
            code: ErrorCodes.BAD_REQUEST,
            message: 'Profanity detected.',
          });
        }

        // Get All hexcode for this selected language
        const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(
          language,
        );

        // Constructed Logic starts from here
        let constructedTextRepCountData =
          await this.scoresService.getConstructedText(
            originalText,
            responseText,
          );
        constructText = constructedTextRepCountData.constructText;
        reptitionCount = constructedTextRepCountData.reptitionCount;
        constructTokenArr = await this.scoresService.getSyllablesFromString(
          constructText,
          vowelSignArr,
          language,
        );

        // Comparison Logic for identify correct and missing tokens
        for (const originalTokenArrEle of originalTokenArr) {
          if (constructTokenArr.includes(originalTokenArrEle)) {
            correctTokens.push(originalTokenArrEle);
          } else {
            missingTokens.push(originalTokenArrEle);
          }
        }
        const missingTokenSet = new Set(missingTokens);
        missingTokens = Array.from(missingTokenSet);

        let identifyTokens = await this.scoresService.identifyTokens(
          CreateLearnerProfileDto.output[0].nBestTokens,
          correctTokens,
          missingTokens,
          tokenHexcodeDataArr,
          vowelSignArr,
        );

        confidence_scoresArr = identifyTokens.confidence_scoresArr;
        missing_token_scoresArr = identifyTokens.missing_token_scoresArr;
        anomaly_scoreArr = identifyTokens.anomaly_scoreArr;

        // Send a call to text eval serivce
        const textEvalMatrices = await this.scoresService.getTextMetrics(
          originalText,
          constructText,
          language,
          CreateLearnerProfileDto.audio.toString('base64'),
        );
        let tempo_classification = textEvalMatrices.tempo_classification;
        let pause_count_textEval = textEvalMatrices.pause_count;
        let words_per_minute = textEvalMatrices.words_per_minute;
        let rate_classification = textEvalMatrices.rate_classification;

        // calculate fluencyScore
        let fluencyScore = await this.scoresService.getCalculatedFluency(
          textEvalMatrices,
          reptitionCount,
          originalText,
          responseText,
          pause_count,
        );

        let accuracy_classification =
          this.scoresService.getAccuracyClassification(
            CreateLearnerProfileDto.contentType,
            fluencyScore,
          );

        createScoreData = {
          user_id: user_id, // userid sent by client
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '', // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || '', // contentId of original text content shown to user to speak
            createdAt: createdAt,
            language: language, // content language
            original_text: CreateLearnerProfileDto.original_text, // content text shown to speak
            response_text: responseText, // text return by ai after converting audio to text
            construct_text: constructText, // this will be constructed by matching response text with original text.
            confidence_scores: confidence_scoresArr, // confidence score array will include char's has identified by ai and has score
            anamolydata_scores: anomaly_scoreArr, // this char's recognise as noise in audio
            missing_token_scores: missing_token_scoresArr, // this char's missed to spoke or recognise by ai
            error_rate: {
              character: textEvalMatrices.cer,
              word: textEvalMatrices.wer,
            },
            count_diff: {
              character: Math.abs(
                CreateLearnerProfileDto.original_text.length -
                CreateLearnerProfileDto.output[0].source.length,
              ),
              word: Math.abs(
                CreateLearnerProfileDto.original_text.split(' ').length -
                CreateLearnerProfileDto.output[0].source.split(' ').length,
              ),
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length,
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length,
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length,
              },
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: pause_count,
            },
            prosody_fluency: {
              pitch: {
                pitch_classification: pitch_classification,
                pitch_mean: pitch_mean,
                pitch_std: pitch_std,
              },
              intensity: {
                intensity_classification: intensity_classification,
                intensity_mean: intensity_mean,
                intensity_std: intensity_std,
              },
              tempo: {
                tempo_classification: tempo_classification,
                words_per_minute: words_per_minute,
                pause_count: pause_count_textEval,
              },
              expression_classification: expression_classification,
              smoothness: {
                smoothness_classification: smoothness_classification,
                pause_count: pause_count,
                avg_pause: avg_pause,
              },
              rate: {
                rate_classification: rate_classification,
                words_per_minute: words_per_minute,
              },
              accuracy: {
                accuracy_classification: accuracy_classification,
                fluencyScore: fluencyScore.toFixed(3),
              },
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false,
          },
        };
        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);
      } else {
        createScoreData = {
          user_id: user_id,
          session: {
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || '',
            createdAt: createdAt,
            language: language,
            original_text: originalText,
            response_text: responseText,
            ansSelectionStatus: ansSelectionStatus,
          },
        };

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);

      }

      // All 3 post-save queries are independent — run in parallel
      let [targets, originalTextSyllables, fluency] = await Promise.all([
        this.scoresService.getTargetsBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
        this.scoresService.getSubsessionOriginalTextSyllables(user_id, CreateLearnerProfileDto.sub_session_id),
        this.scoresService.getFluencyBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
      ]);
      targets = targets.filter((targetsEle) => originalTextSyllables.includes(targetsEle.character));
      const totalTargets = targets.length;

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        originalText: originalText,
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
        ansSelectionStatus: ansSelectionStatus ? ansSelectionStatus : {}
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for storing Hindi language learner profile data. Processes audio through ASR and evaluates pronunciation accuracy.',
    schema: {
      type: 'object',
      properties: {
        original_text: {
          type: 'string',
          example: 'आपसे मिलकर अच्छा लगा',
          description: 'The original Hindi text that the learner is attempting to read',
        },
        audio: {
          type: 'string',
          example: 'base64_encoded_audio_string',
          description: 'Base64 encoded WAV audio file of the learner reading the text',
        },
        session_id: {
          type: 'string',
          example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6',
          description: 'Unique session identifier',
        },
        language: {
          type: 'string',
          example: 'hi',
          description: 'Language code (hi for Hindi)',
        },
        date: {
          type: 'string',
          format: 'date-time',
          example: '2024-05-07T12:24:51.779Z',
          description: 'Timestamp of the recording',
        },
        sub_session_id: {
          type: 'string',
          example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe',
          description: 'Unique sub-session identifier for grouping related attempts',
        },
        contentId: {
          type: 'string',
          example: 'b70af0e5-0d74-4287-9548-4d491c714b0d',
          description: 'Unique identifier for the content being practiced',
        },
        contentType: {
          type: 'string',
          example: 'Sentence',
          description: 'Type of content (Char, Word, Sentence, Paragraph)',
        },
        mode: {
          type: 'string',
          example: 'online',
          description: 'Processing mode (online/offline)',
        },
      },
      required: ['original_text', 'session_id', 'sub_session_id', 'contentId', 'contentType'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Successfully processed and stored learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'आपसे मिलकर अच्छा लगा', description: 'ASR recognized text' },
        subsessionTargetsCount: { type: 'number', example: 17, description: 'Number of target characters in sub-session' },
        subsessionFluency: { type: 'number', example: 1.54, description: 'Fluency score for the sub-session' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while processing or storing learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Update learner profile for Hindi language',
    description: 'Processes audio input through ASR (Automatic Speech Recognition) for Hindi language, evaluates pronunciation accuracy, calculates character-level scores, and stores the results in the learner profile. Supports both online and offline processing modes.',
  })
  @Post('/updateLearnerProfile/hi')
  async updateLearnerProfileHi(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();

      const vowelSignArr = hi_config.vowel;
      const language = hi_config.language_code;
      const originalText = CreateLearnerProfileDto.original_text;
      const createdAt = new Date().toISOString().replace('Z', '+00:00');
      const ansSelectionStatus = CreateLearnerProfileDto.ansSelectionStatus;

      let responseText = '';

      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== 'char') {
        let pause_count = 0;
        let avg_pause = 0;
        let pitch_classification = '';
        let pitch_mean = 0;
        let pitch_std = 0;
        let intensity_classification = '';
        let intensity_mean = 0;
        let intensity_std = 0;
        let expression_classification = '';
        let smoothness_classification = '';

        if (
          CreateLearnerProfileDto['output'] === undefined &&
          CreateLearnerProfileDto.audio !== undefined
        ) {
          const audioFile = CreateLearnerProfileDto.audio;
          const decoded = Buffer.isBuffer(audioFile)
            ? audioFile.toString('base64')
            : audioFile;

          const audioOutput = await this.scoresService.audioFileToAsrOutput(
            decoded,
            CreateLearnerProfileDto.language,
            CreateLearnerProfileDto['contentType'],
          );

          CreateLearnerProfileDto['output'] = audioOutput.asrOutBeforeDenoised?.output || '';
          pause_count = audioOutput.pause_count || 0;
          avg_pause = audioOutput.avg_pause;
          pitch_classification = audioOutput.pitch_classification;
          pitch_mean = audioOutput.pitch_mean;
          pitch_std = audioOutput.pitch_std;
          intensity_classification = audioOutput.intensity_classification;
          intensity_mean = audioOutput.intensity_mean;
          intensity_std = audioOutput.intensity_std;
          expression_classification = audioOutput.expression_classification;
          smoothness_classification = audioOutput.smoothness_classification;

          if (CreateLearnerProfileDto.output[0].source === '') {
            await this.persistEmptyAsrLearnerProfileHi(
              user_id,
              CreateLearnerProfileDto,
              language,
              originalText,
              createdAt,
            );
            throw new BadRequestException({
              code: ErrorCodes.BAD_REQUEST,
              message:
                'Audio to Text functionality responded with an empty response. Please check the audio file or speak louder.',
            });
          }
        }

        responseText = CreateLearnerProfileDto.output[0].source;
        responseText = await this.scoresService.mergeResponseWordsUsingOriginal(originalText, responseText);

        // Profanity Detection logic - Check BEFORE any further processing
        try {
          const badWordResponse = await this.scoresService.checkProfanity(responseText, language);
          if (badWordResponse) {
            const feedback = 'profanity detected';
            console.warn('Profanity detected for user:', user_id, 'session:', CreateLearnerProfileDto.session_id);

            try {
              await this.scoresService.createSessionSummary(user_id, {
                session_id: CreateLearnerProfileDto.session_id,
                sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
                contentType: CreateLearnerProfileDto.contentType,
                contentId: CreateLearnerProfileDto.contentId || '',
                createdAt,
                language,
                original_text: originalText,
                response_text: '***',
                construct_text: '***',
                feedback,
                asrOutput: '***',
              });
            } catch (dbError) {
              console.error('Failed to save profanity data to DB:', dbError);
            }

            return response.status(HttpStatus.CREATED).send({
              status: 'success',
              msg: 'Data stored with profanity detected',
              originalText: originalText,
              responseText: '***',
              feedback: feedback,
            });
          }
        } catch (profanityCheckError) {
          console.error('Profanity check failed:', profanityCheckError);
        }

        // add the vocabulary logic
        try {
          await this.scoresService.vocabularyCount(
            user_id,
            originalText,
            responseText,
            language,
            CreateLearnerProfileDto.session_id,
            CreateLearnerProfileDto.sub_session_id
          );
        } catch (vocabError) {
          console.error('Vocabulary count failed:', vocabError);
        }

        const originalTokenArr = await this.scoresService.getSyllablesFromString(
          originalText,
          vowelSignArr,
          language,
        );

        const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(language);
        const constructedTextRepCountData = await this.scoresService.getConstructedText(
          originalText,
          responseText,
        );
        const constructText = constructedTextRepCountData.constructText;
        const reptitionCount = constructedTextRepCountData.reptitionCount;
        const constructTokenArr = await this.scoresService.getSyllablesFromString(
          constructText,
          vowelSignArr,
          language,
        );

        const correctTokens = [];
        const missingTokens = [];
        for (const originalToken of originalTokenArr) {
          if (constructTokenArr.includes(originalToken)) {
            correctTokens.push(originalToken);
          } else {
            missingTokens.push(originalToken);
          }
        }

        const uniqueMissingTokens = Array.from(new Set(missingTokens));

        const identifyTokens = await this.scoresService.identifyTokens(
          CreateLearnerProfileDto.output[0].nBestTokens,
          correctTokens,
          uniqueMissingTokens,
          tokenHexcodeDataArr,
          vowelSignArr,
        );

        const confidence_scoresArr = identifyTokens.confidence_scoresArr.map((item) => ({
          ...item,
          confidence_score: item.confidence_score < 0.7 ? 0.777 : item.confidence_score,
          identification_status: 1,
        }));
        const missing_token_scoresArr = identifyTokens.missing_token_scoresArr;
        const anomaly_scoreArr = identifyTokens.anomaly_scoreArr;

        const textEvalMatrices = await this.scoresService.getTextMetrics(
          originalText,
          constructText,
          language,
          Buffer.isBuffer(CreateLearnerProfileDto.audio)
            ? CreateLearnerProfileDto.audio.toString('base64')
            : CreateLearnerProfileDto.audio,
        );
        const tempo_classification = textEvalMatrices.tempo_classification;
        const pause_count_textEval = textEvalMatrices.pause_count;
        const words_per_minute = textEvalMatrices.words_per_minute;
        const rate_classification = textEvalMatrices.rate_classification;

        const fluencyScore = await this.scoresService.getCalculatedFluency(
          textEvalMatrices,
          reptitionCount,
          originalText,
          responseText,
          pause_count,
        );

        const accuracy_classification = this.scoresService.getAccuracyClassification(
          CreateLearnerProfileDto.contentType,
          fluencyScore,
        );

        const prosody_fluency = {
          pitch: { pitch_classification, pitch_mean, pitch_std },
          intensity: { intensity_classification, intensity_mean, intensity_std },
          tempo: { tempo_classification, words_per_minute, pause_count: pause_count_textEval },
          expression_classification,
          smoothness: { smoothness_classification, pause_count, avg_pause },
          rate: { rate_classification, words_per_minute },
          accuracy: { accuracy_classification, fluencyScore: fluencyScore.toFixed(3) },
        };

        const sessionData = {
          session_id: CreateLearnerProfileDto.session_id,
          sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
          contentType: CreateLearnerProfileDto.contentType,
          contentId: CreateLearnerProfileDto.contentId || '',
          createdAt,
          language,
          original_text: originalText,
          response_text: responseText,
          construct_text: constructText,
          confidence_scores: confidence_scoresArr,
          anamolydata_scores: anomaly_scoreArr,
          missing_token_scores: missing_token_scoresArr,
          read_duration: CreateLearnerProfileDto.read_duration,
          practice_duration: CreateLearnerProfileDto.practice_duration,
          retry_count: CreateLearnerProfileDto.retry_count,
          error_rate: {
            character: textEvalMatrices.cer,
            word: textEvalMatrices.wer,
          },
          count_diff: {
            character: Math.abs(originalText.length - responseText.length),
            word: Math.abs(
              originalText.split(' ').length - responseText.split(' ').length,
            ),
          },
          eucledian_distance: {
            insertions: {
              chars: textEvalMatrices.insertion,
              count: textEvalMatrices.insertion.length,
            },
            deletions: {
              chars: textEvalMatrices.deletion,
              count: textEvalMatrices.deletion.length,
            },
            substitutions: {
              chars: textEvalMatrices.substitution,
              count: textEvalMatrices.substitution.length,
            },
          },
          fluencyScore: fluencyScore.toFixed(3),
          silence_Pause: { total_duration: 0, count: pause_count },
          reptitionsCount: reptitionCount,
          asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
          isRetry: false,
        };

        await Promise.all([
          this.scoresService.createSessionSummary(user_id, sessionData),
          this.scoresService.createProsodyFluency(
            user_id,
            CreateLearnerProfileDto.session_id,
            CreateLearnerProfileDto.sub_session_id || '',
            language,
            prosody_fluency,
          ),
        ]);
      } else {
        await this.scoresService.createSessionSummary(user_id, {
          session_id: CreateLearnerProfileDto.session_id,
          sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
          contentType: CreateLearnerProfileDto.contentType,
          contentId: CreateLearnerProfileDto.contentId || '',
          createdAt,
          language,
          original_text: originalText,
          response_text: responseText,
          ansSelectionStatus,
        });
      }

      // Post-save queries use new flat session_summary collection
      const [targetsRaw, originalTextSyllables, fluency] = await Promise.all([
        this.scoresService.getTargetsBysubSessionNew(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          language,
        ),
        this.scoresService.getSubsessionOriginalTextSyllablesNew(user_id, CreateLearnerProfileDto.sub_session_id),
        this.scoresService.getFluencyBysubSessionNew(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          language,
        ),
      ]);
      const targets = targetsRaw.filter((targetsEle) => originalTextSyllables.includes(targetsEle.character));

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        originalText,
        responseText,
        subsessionTargetsCount: targets.length,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
        ansSelectionStatus: ansSelectionStatus ? ansSelectionStatus : {}
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for storing Kannada language learner profile data. Processes audio through ASR and evaluates pronunciation accuracy.',
    schema: {
      type: 'object',
      properties: {
        original_text: {
          type: 'string',
          example: 'ಆಕಾಶನ ಮನೆಯು ಅಂಗಡಿಯ ಹತ್ತಿರ ಇದೆ',
          description: 'The original Kannada text that the learner is attempting to read',
        },
        audio: {
          type: 'string',
          example: 'base64_encoded_audio_string',
          description: 'Base64 encoded WAV audio file of the learner reading the text',
        },
        session_id: {
          type: 'string',
          example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6',
          description: 'Unique session identifier',
        },
        language: {
          type: 'string',
          example: 'kn',
          description: 'Language code (kn for Kannada)',
        },
        date: {
          type: 'string',
          format: 'date-time',
          example: '2024-05-07T12:24:51.779Z',
          description: 'Timestamp of the recording',
        },
        sub_session_id: {
          type: 'string',
          example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe',
          description: 'Unique sub-session identifier for grouping related attempts',
        },
        contentId: {
          type: 'string',
          example: 'b70af0e5-0d74-4287-9548-4d491c714b0d',
          description: 'Unique identifier for the content being practiced',
        },
        contentType: {
          type: 'string',
          example: 'Sentence',
          description: 'Type of content (Char, Word, Sentence, Paragraph)',
        },
        mode: {
          type: 'string',
          example: 'online',
          description: 'Processing mode (online/offline)',
        },
      },
      required: ['original_text', 'session_id', 'sub_session_id', 'contentId', 'contentType'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Successfully processed and stored learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'ಆಕಾಶನ ಮನೆಯು ಅಂಗಡಿಯ ಹತ್ತಿರ ಇದೆ', description: 'ASR recognized text' },
        subsessionTargetsCount: { type: 'number', example: 17, description: 'Number of target characters in sub-session' },
        subsessionFluency: { type: 'number', example: 1.54, description: 'Fluency score for the sub-session' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while processing or storing learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Update learner profile for Kannada language',
    description: 'Processes audio input through ASR (Automatic Speech Recognition) for Kannada language, evaluates pronunciation accuracy, calculates character-level scores, and stores the results in the learner profile. Supports both online and offline processing modes.',
  })
  @Post('/updateLearnerProfile/kn')
  async updateLearnerProfileKn(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      const confidence_scoresArr = [];
      const anomaly_scoreArr = [];
      const missing_token_scoresArr = [];
      const correctTokens = [];
      let missingTokens = [];
      let vowelSignArr = [];
      const originalTokenArr = [];
      const responseTokenArr = [];
      const constructTokenArr = [];
      const mode = CreateLearnerProfileDto.mode;

      const language = kn_config.language_code;

      const originalText = CreateLearnerProfileDto.original_text;
      const originalTextTokensArr = originalText.split('');

      const kannadaVowelSignArr = kn_config.vowel;
      vowelSignArr = kannadaVowelSignArr;

      let responseText = '';

      let prevEle = '';
      let isPrevVowel = false;
      let createScoreData: any;

      let pause_count = 0;
      let audioFile;
      let avg_pause = 0;

      let pitch_classification = '';
      let pitch_mean = 0;
      let pitch_std = 0;
      let intensity_classification = '';
      let intensity_mean = 0;
      let intensity_std = 0;
      let expression_classification = '';
      let smoothness_classification = '';
      let tokenArrandAnamolyArrdefine = false;
      let tokenArr = [];
      let anamolyTokenArr = [];

      let createdAt = new Date().toISOString().replace('Z', '+00:00');
      let ansSelectionStatus = CreateLearnerProfileDto.ansSelectionStatus;

      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== 'char') {
        if (mode == 'online' || mode == undefined) {
          if (
            CreateLearnerProfileDto['output'] === undefined &&
            CreateLearnerProfileDto.audio !== undefined
          ) {
            audioFile = CreateLearnerProfileDto.audio;
            const decoded = audioFile.toString('base64');
            const audioOutput = await this.scoresService.audioFileToAsrOutput(
              decoded,
              'kn',
              CreateLearnerProfileDto['contentType'],
            );
            CreateLearnerProfileDto['output'] = audioOutput.asrOutBeforeDenoised?.output || '';
            pause_count = audioOutput.pause_count || 0;
            avg_pause = audioOutput.avg_pause;
            pitch_classification = audioOutput.pitch_classification;
            pitch_mean = audioOutput.pitch_mean;
            pitch_std = audioOutput.pitch_std;
            intensity_classification = audioOutput.intensity_classification;
            intensity_mean = audioOutput.intensity_mean;
            intensity_std = audioOutput.intensity_std;
            expression_classification = audioOutput.expression_classification;
            smoothness_classification = audioOutput.smoothness_classification;

            if (CreateLearnerProfileDto.output[0].source === '') {
              await this.persistEmptyAsrLearnerProfile(
                user_id,
                CreateLearnerProfileDto,
                language,
                originalText,
                createdAt,
              );
              throw new BadRequestException({
                code: ErrorCodes.BAD_REQUEST,
                message:
                  'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
              });
            }
          }
          let constructTokens = [];

          if (CreateLearnerProfileDto.contentType.toLowerCase() == 'word') {
            // If it is word check for Token combinations and agreeable substitutes for word improvements
            let originalSimilarity = await this.scoresService.getTextSimilarity(
              CreateLearnerProfileDto.output[0].source,
              originalText,
            );
            constructTokens = await this.scoresService.processTokens(
              CreateLearnerProfileDto.output[0].nBestTokens,
            );
            const wordsWithValues = await this.scoresService.generateWords(
              constructTokens,
            ); // Form all possible words from ASR tokens
            const replacements = kn_config.replacements;
            const firstChar = originalText[0];
            if (replacements.hasOwnProperty(firstChar)) {
              // If it is agreeable , construct the possible orignal words and compare all construted words for better possible response
              let agreeableResults =
                replacements[firstChar] + originalText.slice(1);
              let agreeableHighestSimilarity =
                await this.scoresService.findAllSimilarities(wordsWithValues, [
                  originalText,
                  agreeableResults,
                ]);
              if (originalSimilarity >= agreeableHighestSimilarity[3]) {
                responseText = CreateLearnerProfileDto.output[0].source;
                tokenArrandAnamolyArrdefine = true;
              } else {
                //if the constructed has highesr similarity we'll be pushing the usedArr into tokenArr and unusedArr into anamolyTokenArr
                responseText = agreeableHighestSimilarity[0];
                tokenArr = agreeableHighestSimilarity[1];
                anamolyTokenArr = agreeableHighestSimilarity[2];
              }
            } else {
              // If is not agreeable, compare the costructed words with original and get hisghest
              let constructedHighestSimilarity =
                await this.scoresService.findAllSimilarities(wordsWithValues, [
                  originalText,
                ]);
              if (originalSimilarity >= constructedHighestSimilarity[3]) {
                responseText = CreateLearnerProfileDto.output[0].source;
                tokenArrandAnamolyArrdefine = true;
              } else {
                //if the constructed has highesr similarity we'll be pushing the usedArr into tokenArr and unusedArr into anamolyTokenArr
                responseText = constructedHighestSimilarity[0];
                tokenArr = constructedHighestSimilarity[1];
                anamolyTokenArr = constructedHighestSimilarity[2];
              }
            }
          } else {
            // If it is not a word use reeponse given by ASR
            responseText = CreateLearnerProfileDto.output[0].source;
          }
        } else {
          responseText = CreateLearnerProfileDto.response_text;
          pause_count = CreateLearnerProfileDto.pause_count;
        }
        // add the vocabulary logic
        await this.scoresService.vocabularyCount(
          user_id,
          originalText,
          responseText,
          language,
          CreateLearnerProfileDto.session_id,
          CreateLearnerProfileDto.sub_session_id
        )

        const badWordResponse = await this.scoresService.checkProfanity(responseText, language)
        if (badWordResponse) {
          throw new BadRequestException({
            code: ErrorCodes.BAD_REQUEST,
            message: 'Profanity detected.',
          });
        }

        const responseTextTokensArr = responseText.split('');

        let constructText = '';

        const tokenHexcodeData = this.scoresService.gethexcodeMapping(language);
        let tokenHexcodeDataArr = [];

        await tokenHexcodeData.then((tokenHexcodedata: any) => {
          tokenHexcodeDataArr = tokenHexcodedata;
        });

        // Prepare Constructed Text
        const compareCharArr = [];

        const constructTextSet = new Set();

        let reptitionCount = 0;

        for (const originalEle of CreateLearnerProfileDto.original_text.split(
          ' ',
        )) {
          let originalRepCount = 0;
          for (const sourceEle of responseText.split(' ')) {
            const similarityScore = similarity(originalEle, sourceEle);
            if (similarityScore >= 0.4) {
              compareCharArr.push({
                original_text: originalEle,
                response_text: sourceEle,
                score: similarity(originalEle, sourceEle),
              });
              //break;
            }
            if (similarityScore >= 0.6) {
              originalRepCount++;
            }
          }
          if (originalRepCount >= 2) {
            reptitionCount++;
          }
        }

        for (const compareCharArrEle of compareCharArr) {
          let score = 0;
          let word = '';
          for (const compareCharArrCmpEle of compareCharArr) {
            if (
              compareCharArrEle.original_text ===
              compareCharArrCmpEle.original_text
            ) {
              if (compareCharArrCmpEle.score > score) {
                score = compareCharArrCmpEle.score;
                word = compareCharArrCmpEle.response_text;
              }
            }
          }
          constructTextSet.add(word);
        }

        for (const constructTextSetEle of constructTextSet) {
          constructText += constructTextSetEle + ' ';
        }
        constructText = constructText.trim();

        function similarity(s1, s2) {
          let longer = s1;
          let shorter = s2;
          if (s1.length < s2.length) {
            longer = s2;
            shorter = s1;
          }
          const longerLength = longer.length;
          if (longerLength == 0) {
            return 1.0;
          }
          return (
            (longerLength - editDistance(longer, shorter)) /
            parseFloat(longerLength)
          );
        }

        function editDistance(s1, s2) {
          s1 = s1.toLowerCase();
          s2 = s2.toLowerCase();

          const costs = [];
          for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
              if (i == 0) costs[j] = j;
              else {
                if (j > 0) {
                  let newValue = costs[j - 1];
                  if (s1.charAt(i - 1) != s2.charAt(j - 1))
                    newValue =
                      Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                  costs[j - 1] = lastValue;
                  lastValue = newValue;
                }
              }
            }
            if (i > 0) costs[s2.length] = lastValue;
          }
          return costs[s2.length];
        }

        for (const constructTextELE of constructText.split('')) {
          if (constructTextELE != ' ') {
            if (vowelSignArr.includes(constructTextELE)) {
              if (isPrevVowel) {
                prevEle = prevEle + constructTextELE;
                constructTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + constructTextELE;
                constructTokenArr.push(prevEle);
              }
              isPrevVowel = true;
            } else {
              constructTokenArr.push(constructTextELE);
              prevEle = constructTextELE;
              isPrevVowel = false;
            }
          }
        }

        // End Constructed Text Logic

        for (const originalTextELE of originalText.split('')) {
          if (originalTextELE != ' ') {
            if (vowelSignArr.includes(originalTextELE)) {
              if (isPrevVowel) {
                prevEle = prevEle + originalTextELE;
                originalTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + originalTextELE;
                originalTokenArr.push(prevEle);
              }
              isPrevVowel = true;
            } else {
              originalTokenArr.push(originalTextELE);
              prevEle = originalTextELE;
              isPrevVowel = false;
            }
          }
        }

        for (const responseTextELE of responseText.split('')) {
          if (responseTextELE != ' ') {
            if (vowelSignArr.includes(responseTextELE)) {
              if (isPrevVowel) {
                prevEle = prevEle + responseTextELE;
                responseTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + responseTextELE;
                responseTokenArr.push(prevEle);
              }
              isPrevVowel = true;
            } else {
              responseTokenArr.push(responseTextELE);
              prevEle = responseTextELE;
              isPrevVowel = false;
            }
          }
        }

        // Comparison Logic

        for (const originalTokenArrEle of originalTokenArr) {
          if (constructTokenArr.includes(originalTokenArrEle)) {
            correctTokens.push(originalTokenArrEle);
          } else {
            missingTokens.push(originalTokenArrEle);
          }
        }

        const missingTokenSet = new Set(missingTokens);

        missingTokens = Array.from(missingTokenSet);

        const filteredTokenArr = [];

        //token list for ai4bharat response

        // Create Single Array from AI4bharat tokens array
        // generate tokenArr and anamolytokenArr if it is not word or using ASR returned resposne for content type word
        if (
          CreateLearnerProfileDto.contentType.toLowerCase() != 'word' ||
          tokenArrandAnamolyArrdefine
        ) {
          CreateLearnerProfileDto.output[0].nBestTokens.forEach((element) => {
            element.tokens.forEach((token) => {
              const key = Object.keys(token)[0];
              const value = Object.values(token)[0];

              let insertObj = {};
              insertObj[key] = value;
              tokenArr.push(insertObj);

              const key1 = Object.keys(token)[1];
              const value1 = Object.values(token)[1];
              insertObj = {};
              insertObj[key1] = value1;
              anamolyTokenArr.push(insertObj);
            });
          });
        }

        const uniqueChar = new Set();
        prevEle = '';
        isPrevVowel = false;

        // Create Unique token array
        for (const tokenArrEle of tokenArr) {
          const tokenString = Object.keys(tokenArrEle)[0];
          for (const keyEle of tokenString.split('')) {
            if (vowelSignArr.includes(keyEle)) {
              if (isPrevVowel) {
                prevEle = prevEle + keyEle;
                uniqueChar.add(prevEle);
              } else {
                prevEle = prevEle + keyEle;
                uniqueChar.add(prevEle);
              }
              isPrevVowel = true;
            } else {
              uniqueChar.add(keyEle);
              isPrevVowel = false;
              prevEle = keyEle;
            }
          }
        }

        //unique token list for ai4bharat response
        const uniqueCharArr = Array.from(uniqueChar);

        isPrevVowel = false;

        // Get best score for Each Char
        for (const char of uniqueCharArr) {
          let score = 0.0;
          let prevChar = '';
          let isPrevVowel = false;

          for (const tokenArrEle of tokenArr) {
            const tokenString = Object.keys(tokenArrEle)[0];
            const tokenValue = Object.values(tokenArrEle)[0];

            for (const keyEle of tokenString.split('')) {
              const scoreVal: any = tokenValue;
              let charEle: any = keyEle;

              if (vowelSignArr.includes(charEle)) {
                if (isPrevVowel) {
                  prevChar = prevChar + charEle;
                  charEle = prevChar;
                } else {
                  prevChar = prevChar + charEle;
                  charEle = prevChar;
                }
                isPrevVowel = true;
              } else {
                prevChar = charEle;
                isPrevVowel = false;
              }

              if (char === charEle) {
                if (scoreVal > score) {
                  score = scoreVal;
                }
              }
            }
          }

          filteredTokenArr.push({ charkey: char, charvalue: score });
        }

        // Create confidence token, Missing token array and anomoly token array
        for (const value of filteredTokenArr) {
          const score: any = value.charvalue;

          let identification_status = 0;

          if (score >= 0.9) {
            identification_status = 1;
          } else if (score >= 0.4) {
            identification_status = -1;
          } else {
            identification_status = 0;
          }

          if (value.charkey !== '' && value.charkey !== '▁') {
            if (correctTokens.includes(value.charkey)) {
              const hexcode = getTokenHexcode(value.charkey);

              if (hexcode !== '') {
                let confidenceScore =
                  value.charvalue > 0.7 ? value.charvalue : 0.777;
                confidence_scoresArr.push({
                  token: value.charkey,
                  hexcode: hexcode,
                  confidence_score: confidenceScore,
                  identification_status: 1,
                });
              } else {
                if (
                  !missingTokens.includes(value.charkey) &&
                  !constructTokenArr.includes(value.charkey)
                ) {
                  anomaly_scoreArr.push({
                    token: value.charkey.replaceAll('_', ''),
                    hexcode: hexcode,
                    confidence_score: value.charvalue,
                    identification_status: identification_status,
                  });
                }
              }
            }
          }
        }

        for (const missingTokensEle of missingTokenSet) {
          const hexcode = getTokenHexcode(missingTokensEle);

          if (hexcode !== '') {
            if (kannadaVowelSignArr.includes(missingTokensEle)) {
            } else {
              if (!uniqueChar.has(missingTokensEle)) {
                missing_token_scoresArr.push({
                  token: missingTokensEle,
                  hexcode: hexcode,
                  confidence_score: 0.1,
                  identification_status: 0,
                });
              }
            }
          }
        }

        for (const anamolyTokenArrEle of anamolyTokenArr) {
          const tokenString = Object.keys(anamolyTokenArrEle)[0];
          const tokenValue = Object.values(anamolyTokenArrEle)[0];

          if (tokenString != '') {
            const hexcode = getTokenHexcode(tokenString);
            if (hexcode !== '') {
              if (kannadaVowelSignArr.includes(tokenString)) {
              } else {
                anomaly_scoreArr.push({
                  token: tokenString.replaceAll('_', ''),
                  hexcode: hexcode,
                  confidence_score: tokenValue,
                  identification_status: 0,
                });
              }
            }
          }
        }

        const url = process.env.ALL_TEXT_EVAL_API + '/getTextMatrices';

        const textData = {
          reference: CreateLearnerProfileDto.original_text,
          hypothesis: CreateLearnerProfileDto.output[0].source,
          language: 'kn',
          base64_string: audioFile?.toString('base64'),
        };

        const textEvalMatrices = await lastValueFrom(
          this.httpService
            .post(url, JSON.stringify(textData), {
              headers: {
                'Content-Type': 'application/json',
              },
            })
            .pipe(
              map((resp) => resp.data),
              catchError((error: AxiosError) => {
                throw mapAxiosToUpstreamHttpException(
                  'text-eval',
                  ErrorCodes.TEXT_EVAL_UNAVAILABLE,
                  'Text evaluation service is unavailable or returned an error while computing text matrices.',
                  error,
                );
              }),
            ),
        );
        let tempo_classification = textEvalMatrices.tempo_classification;
        let pause_count_textEval = textEvalMatrices.pause_count;
        let words_per_minute = textEvalMatrices.words_per_minute;
        let rate_classification = textEvalMatrices.rate_classification;

        const wer = textEvalMatrices.wer;
        const cercal = textEvalMatrices.cer * 2;
        const charCount = Math.abs(
          CreateLearnerProfileDto.original_text.length - responseText.length,
        );
        const wordCount = Math.abs(
          CreateLearnerProfileDto.original_text.split(' ').length -
          responseText.split(' ').length,
        );
        const repetitions = reptitionCount;
        const pauseCount = pause_count;
        const ins = textEvalMatrices.insertion.length;
        const del = textEvalMatrices.deletion.length;
        const sub = textEvalMatrices.substitution.length;

        const fluencyScore =
          (wer * 5 +
            cercal * 10 +
            charCount * 10 +
            wordCount * 10 +
            repetitions * 10 +
            pauseCount * 10 +
            ins * 20 +
            del * 15 +
            sub * 5) /
          100;

        let accuracy_classification =
          this.scoresService.getAccuracyClassification(
            CreateLearnerProfileDto.contentType,
            fluencyScore,
          );

        createScoreData = {
          user_id: user_id,
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '', // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || '', // contentId of original text content shown to user to speak
            createdAt: createdAt,
            language: language, // content language
            original_text: CreateLearnerProfileDto.original_text, // content text shown to speak
            response_text: responseText, // text return by ai after converting audio to text
            construct_text: constructText, // this will be constructed by matching response text with original text.
            confidence_scores: confidence_scoresArr, // confidence score array will include char's has identified by ai and has score
            anamolydata_scores: anomaly_scoreArr, // this char's recognise as noise in audio
            missing_token_scores: missing_token_scoresArr, // this char's missed to spoke or recognise by ai
            read_duration: CreateLearnerProfileDto.read_duration, // This is for cal the fluency duration.
            practice_duration: CreateLearnerProfileDto.practice_duration,
            retry_count: CreateLearnerProfileDto.retry_count,
            error_rate: {
              character: textEvalMatrices.cer,
              word: textEvalMatrices.wer,
            },
            count_diff: {
              character: Math.abs(
                CreateLearnerProfileDto.original_text.length -
                responseText.length,
              ),
              word: Math.abs(
                CreateLearnerProfileDto.original_text.split(' ').length -
                responseText.split(' ').length,
              ),
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length,
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length,
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length,
              },
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: pause_count,
            },
            prosody_fluency: {
              pitch: {
                pitch_classification: pitch_classification,
                pitch_mean: pitch_mean,
                pitch_std: pitch_std,
              },
              intensity: {
                intensity_classification: intensity_classification,
                intensity_mean: intensity_mean,
                intensity_std: intensity_std,
              },
              tempo: {
                tempo_classification: tempo_classification,
                words_per_minute: words_per_minute,
                pause_count: pause_count_textEval,
              },
              expression_classification: expression_classification,
              smoothness: {
                smoothness_classification: smoothness_classification,
                pause_count: pause_count,
                avg_pause: avg_pause,
              },
              rate: {
                rate_classification: rate_classification,
                words_per_minute: words_per_minute,
              },
              accuracy: {
                accuracy_classification: accuracy_classification,
                fluencyScore: fluencyScore.toFixed(3),
              },
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false,
            mode: mode,
          },
        };

        // Store Array to DB
        const data = this.scoresService.create(createScoreData);

        function getTokenHexcode(token: string) {
          const result = tokenHexcodeDataArr.find(
            (item) => item.token.trim() === token.trim(),
          );
          return result?.hexcode || '';
        }
      } else {
        createScoreData = {
          user_id: user_id,
          session: {
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || '',
            createdAt: createdAt,
            language: language,
            original_text: originalText,
            response_text: responseText,
            ansSelectionStatus: ansSelectionStatus,
          },
        };

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);

      }

      // All 3 post-save queries are independent — run in parallel
      let [targets, originalTextSyllables, fluency] = await Promise.all([
        this.scoresService.getTargetsBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
        this.scoresService.getSubsessionOriginalTextSyllables(user_id, CreateLearnerProfileDto.sub_session_id),
        this.scoresService.getFluencyBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
      ]);
      targets = targets.filter((targetsEle) => originalTextSyllables.includes(targetsEle.character));
      const totalTargets = targets.length;

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
        ansSelectionStatus: ansSelectionStatus ? ansSelectionStatus : {}
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for storing English language learner profile data. Processes audio through ASR and evaluates pronunciation accuracy using phoneme-level analysis.',
    schema: {
      type: 'object',
      properties: {
        original_text: {
          type: 'string',
          example: 'assisted language learning',
          description: 'The original English text that the learner is attempting to read',
        },
        audio: {
          type: 'string',
          example: 'base64_encoded_audio_string',
          description: 'Base64 encoded WAV audio file of the learner reading the text',
        },
        session_id: {
          type: 'string',
          example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6',
          description: 'Unique session identifier',
        },
        language: {
          type: 'string',
          example: 'en',
          description: 'Language code (en for English)',
        },
        date: {
          type: 'string',
          format: 'date-time',
          example: '2024-05-07T12:24:51.779Z',
          description: 'Timestamp of the recording',
        },
        sub_session_id: {
          type: 'string',
          example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe',
          description: 'Unique sub-session identifier for grouping related attempts',
        },
        contentId: {
          type: 'string',
          example: 'b70af0e5-0d74-4287-9548-4d491c714b0d',
          description: 'Unique identifier for the content being practiced',
        },
        contentType: {
          type: 'string',
          example: 'Sentence',
          description: 'Type of content (Char, Word, Sentence, Paragraph)',
        },
        mode: {
          type: 'string',
          example: 'online',
          description: 'Processing mode (online/offline)',
        },
      },
      required: ['original_text', 'session_id', 'sub_session_id', 'contentId', 'contentType'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Successfully processed and stored learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'assisted language learning', description: 'ASR recognized text' },
        subsessionTargetsCount: { type: 'number', example: 17, description: 'Number of target phonemes in sub-session' },
        subsessionFluency: { type: 'number', example: 1.54, description: 'Fluency score for the sub-session' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while processing or storing learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Update learner profile for English language',
    description: 'Processes audio input through ASR (Automatic Speech Recognition) for English language, evaluates pronunciation accuracy at the phoneme level, calculates grapheme-phoneme scores, and stores the results in the learner profile. Supports both online and offline processing modes.',
  })
  @Post('/updateLearnerProfile/en')
  async updateLearnerProfileEn(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      const originalText = await this.scoresService.processText(
        CreateLearnerProfileDto.original_text,
      );
      const substitutions = en_config.substitutions
      const mode = CreateLearnerProfileDto.mode;

      let createScoreData;
      let language = en_config.language_code;
      let reptitionCount = 0;
      let responseText = '';
      let confidence_scoresArr = [];
      let anomaly_scoreArr = [];
      let missing_token_scoresArr = [];

      let pause_count = 0;
      let avg_pause = 0;

      let pitch_classification = '';
      let pitch_mean = 0;
      let pitch_std = 0;
      let intensity_classification = '';
      let intensity_mean = 0;
      let intensity_std = 0;
      let expression_classification = '';
      let smoothness_classification = '';

      let correct_choice_score = 0;
      let correctness_score = 0;
      let is_correct_choice = CreateLearnerProfileDto.is_correct_choice;
      let comprehension;
      let createdAt = new Date().toISOString().replace('Z', '+00:00');
      let is_nonAsr = CreateLearnerProfileDto.is_nonAsr;
      let feedback = '';

      /* Condition to check whether content type is char or not. If content type is char
      dont process it from ASR and other processing related with text evalution matrices and scoring mechanism
      */

      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== 'char' && (is_nonAsr === undefined || is_nonAsr === false)) {
        let audioFile;

          if (
            CreateLearnerProfileDto['output'] === undefined &&
            CreateLearnerProfileDto.audio !== undefined
          ) {
            audioFile = CreateLearnerProfileDto.audio;
            const decoded = audioFile.toString('base64');

            // Send Audio file to ASR to process and provide vector with char and score
            let audioOutput = await this.scoresService.audioFileToAsrOutput(
              decoded,
              CreateLearnerProfileDto.language,
              CreateLearnerProfileDto['contentType'],
            );

            CreateLearnerProfileDto['output'] = audioOutput.asrOutBeforeDenoised?.output || '';
            pause_count = audioOutput.pause_count || 0;
            avg_pause = audioOutput.avg_pause;
            pitch_classification = audioOutput.pitch_classification;
            pitch_mean = audioOutput.pitch_mean;
            pitch_std = audioOutput.pitch_std;
            intensity_classification = audioOutput.intensity_classification;
            intensity_mean = audioOutput.intensity_mean;
            intensity_std = audioOutput.intensity_std;
            expression_classification = audioOutput.expression_classification;
            smoothness_classification = audioOutput.smoothness_classification;

            if (CreateLearnerProfileDto.output[0].source === '') {
              await this.persistEmptyAsrLearnerProfile(
                user_id,
                CreateLearnerProfileDto,
                language,
                originalText,
                createdAt,
              );
              throw new BadRequestException({
                code: ErrorCodes.BAD_REQUEST,
                message:
                  'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
              });
            }
          }

          responseText = await this.scoresService.processText(
            CreateLearnerProfileDto.output[0].source,
          );

        // Profanity Detection logic
        try {
          const badWordResponse = await this.scoresService.checkProfanity(responseText, language);
          if (badWordResponse) {
            feedback = 'profanity detected';
            
            // Create minimal data object
            const profanityScoreData = {
              user_id: user_id,
              session: {
                session_id: CreateLearnerProfileDto.session_id,
                sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
                contentType: CreateLearnerProfileDto.contentType,
                contentId: CreateLearnerProfileDto.contentId || '',
                createdAt: createdAt,
                language: language,
                original_text: originalText,
                response_text: '***',
                construct_text: '***', // Required field, redacted for profanity
                feedback: feedback,
                asrOutput: '***', // Required field, redacted for profanity
              },
            };

            try {
              await this.scoresService.create(profanityScoreData);
            } catch (dbError) {
              console.error('Failed to save profanity data to DB:', dbError);
            }

            return response.status(HttpStatus.CREATED).send({
              status: 'success',
              msg: 'Data stored with profanity detected',
              originalText: originalText,
              responseText: '***',
              feedback: feedback,
            });
          }
        } catch (profanityCheckError) {
          console.error('Profanity check failed:', profanityCheckError);
          // Continue processing if profanity check fails (fail-safe approach)
        }

        // add the vocabulary logic
        try {
          await this.scoresService.vocabularyCount(
            user_id,
            originalText,
            responseText,
            language,
            CreateLearnerProfileDto.session_id,
            CreateLearnerProfileDto.sub_session_id
          );
        } catch (vocabError) {
          console.error('Vocabulary count failed:', vocabError);
          // Continue processing even if vocabulary count fails
        }

        // Agreeable substitution logic
        responseText = await this.scoresService.getBestCorrectedResponse(originalText, responseText, substitutions)

        // Get All hexcode for this selected language
        const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(
          language,
        );

        const textEvalMatrices = await this.scoresService.getTextMetrics(
          originalText,
          responseText,
          language,
          CreateLearnerProfileDto.audio.toString('base64'),
        );
        let tempo_classification = textEvalMatrices.tempo_classification;
        let pause_count_textEval = textEvalMatrices.pause_count;
        let words_per_minute = textEvalMatrices.words_per_minute;
        let rate_classification = textEvalMatrices.rate_classification;


        if (
          CreateLearnerProfileDto.ans_key &&
          CreateLearnerProfileDto.ans_key.length > 0 &&
          responseText.length > 0
        ) {
          comprehension = await this.scoresService.getComprehensionFromLLM(
            CreateLearnerProfileDto.question_text,
            responseText,
            CreateLearnerProfileDto.ans_key[0],
          );

          let createLlmOutputLog = {
            user_id: user_id,
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
            questionText: CreateLearnerProfileDto.question_text || '',
            teacherText: originalText,
            studentText: responseText,
            ansKey: CreateLearnerProfileDto.ans_key,
            marks: comprehension.marks,
            semantics: comprehension.semantics,
            grammar: comprehension.grammar,
            accuracy: comprehension.accuracy,
            overall: comprehension.overall,
            feedback: comprehension.feedback
          };
          await this.scoresService.addLlmOutputLog(createLlmOutputLog);
        }

        if (
          CreateLearnerProfileDto['contentType'].toLowerCase() === 'word' &&
          CreateLearnerProfileDto.hallucination_alternative &&
          Array.isArray(CreateLearnerProfileDto.hallucination_alternative) &&
          CreateLearnerProfileDto.hallucination_alternative.length > 0
        ) {
          function checkResponseTextAnomaly(responseText: string): boolean {
            const phrasesToCheck = ['thank you', 'and', 'yes'];
            return phrasesToCheck.some((phrase) =>
              responseText.includes(phrase),
            );
          }

          const checkHallucinationAlternatives = async (
            responseText: string,
            hallucinationAlternatives: any,
          ): Promise<boolean> => {
            const similarityThreshold = 0.5; // 50% similarity
            for (const alternative of hallucinationAlternatives) {
              const similarityScore =
                await this.scoresService.getTextSimilarity(
                  responseText,
                  alternative,
                );
              if (similarityScore >= similarityThreshold) {
                return true;
              }
            }
            return false;
          };

          const checkConstructTextSimilarity = async (
            constructText: string,
          ): Promise<boolean> => {
            const similarityThreshold = 0.5;
            const similarityScore = await this.scoresService.getTextSimilarity(
              constructText,
              originalText,
            );
            return similarityScore >= similarityThreshold;
          };

          if (
            (await checkResponseTextAnomaly(responseText)) ||
            (await checkHallucinationAlternatives(
              responseText,
              CreateLearnerProfileDto.hallucination_alternative,
            )) ||
            (await checkConstructTextSimilarity(responseText))
          ) {
            responseText = originalText;
          }
        }

        for (const confidence_char of textEvalMatrices.confidence_char_list) {
          const hexcode = await this.scoresService.getTokenHexcode(
            tokenHexcodeDataArr,
            confidence_char,
          );

          if (hexcode !== '') {
            confidence_scoresArr.push({
              token: confidence_char.replaceAll('_', ''),
              hexcode: hexcode,
              confidence_score: 0.99,
              identification_status: 1,
            });
          } else {
            anomaly_scoreArr.push({
              token: confidence_char.replaceAll('_', ''),
              hexcode: hexcode,
              confidence_score: 0.99,
              identification_status: 1,
            });
          }
        }

        for (const missing_char of textEvalMatrices.missing_char_list) {
          const hexcode = await this.scoresService.getTokenHexcode(
            tokenHexcodeDataArr,
            missing_char,
          );

          if (hexcode !== '') {
            missing_token_scoresArr.push({
              token: missing_char.replaceAll('_', ''),
              hexcode: hexcode,
              confidence_score: 0.1,
              identification_status: -1,
            });
          } else {
            missing_token_scoresArr.push({
              token: missing_char.replaceAll('_', ''),
              hexcode: hexcode,
              confidence_score: 0.1,
              identification_status: -1,
            });
          }
        }
        // Constructed Logic starts from here
        let constructedTextRepCountData =
          await this.scoresService.getConstructedText(
            originalText,
            responseText,
          );
        let repetitions = constructedTextRepCountData.reptitionCount;
        // End Constructed Text Logic

        let fluencyScore = await this.scoresService.getCalculatedFluency(
          textEvalMatrices,
          repetitions,
          originalText,
          responseText,
          pause_count,
        );

        let accuracy_classification =
          this.scoresService.getAccuracyClassification(
            CreateLearnerProfileDto.contentType,
            fluencyScore,
          );

        // Add check for the correct choice

        if (is_correct_choice !== undefined && is_correct_choice !== null) {
          // calculation for the correct choice final score
          const similarityScore = await this.scoresService.getTextSimilarity(originalText, responseText);
          let similarityDenoised = similarityScore * 100;
          let key_word = CreateLearnerProfileDto.correctness['50%'];
          const allWordsPresent = key_word.every((word) =>
            responseText.includes(word.toLowerCase()),
          );

          if (is_correct_choice && similarityDenoised >= 70) {
            correctness_score = 100;
          } else if (is_correct_choice && allWordsPresent) {
            correctness_score = 60;
          } else if (is_correct_choice) {
            correctness_score = 20;
          }
        }

        createScoreData = {
          user_id: user_id, // userid sent by client
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '', // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || '', // contentId of original text content shown to user to speak
            comprehension: comprehension, // Response from LLM for mechanics
            createdAt: createdAt,
            language: language, // content language
            original_text: originalText, // content text shown to speak
            response_text: responseText, // text return by ai after converting audio to text
            construct_text: textEvalMatrices.construct_text.trim(), // this will be constructed by matching response text with original text.
            confidence_scores: confidence_scoresArr, // confidence score array will include char's has identified by ai and has score
            anamolydata_scores: anomaly_scoreArr, // this char's recognise as noise in audio
            missing_token_scores: missing_token_scoresArr, // this char's missed to spoke or recognise by ai
            read_duration: CreateLearnerProfileDto.read_duration, // This is for cal the fluency duration.
            practice_duration: CreateLearnerProfileDto.practice_duration,
            retry_count: CreateLearnerProfileDto.retry_count,
            is_correct_choice: is_correct_choice,
            correctness_score: correctness_score,
            error_rate: {
              character: textEvalMatrices.cer,
              word: textEvalMatrices.wer,
            },
            count_diff: {
              character: Math.abs(originalText.length - responseText.length),
              word: Math.abs(
                originalText.split(' ').length - responseText.split(' ').length,
              ),
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length,
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length,
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length,
              },
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: pause_count,
            },
            prosody_fluency: {
              pitch: {
                pitch_classification: pitch_classification,
                pitch_mean: pitch_mean,
                pitch_std: pitch_std,
              },
              intensity: {
                intensity_classification: intensity_classification,
                intensity_mean: intensity_mean,
                intensity_std: intensity_std,
              },
              tempo: {
                tempo_classification: tempo_classification,
                words_per_minute: words_per_minute,
                pause_count: pause_count_textEval,
              },
              expression_classification: expression_classification,
              smoothness: {
                smoothness_classification: smoothness_classification,
                pause_count: pause_count,
                avg_pause: avg_pause,
              },
              rate: {
                rate_classification: rate_classification,
                words_per_minute: words_per_minute,
              },
              accuracy: {
                accuracy_classification: accuracy_classification,
                fluencyScore: fluencyScore.toFixed(3),
              },
            },
            reptitionsCount: reptitionCount,
            asrOutput: CreateLearnerProfileDto.output
              ? JSON.stringify(CreateLearnerProfileDto.output)
              : 'No Asr call',
            mechanics_id: CreateLearnerProfileDto.mechanics_id || '',
            isRetry: false,
            mode: mode,
            feedback: feedback,
          },
        };


        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);

      } else {

        createScoreData = {
          user_id: user_id,
          session: {
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || '',
            createdAt: createdAt,
            language: language,
            original_text: originalText,
            response_text: responseText,
            ansSelectionStatus: CreateLearnerProfileDto.ansSelectionStatus,
            feedback: feedback,
          },
        };

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);

      }

      // Both post-save queries are independent — run in parallel
      const [targets, fluency] = await Promise.all([
        this.scoresService.getTargetsBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
        this.scoresService.getFluencyBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
      ]);

      const totalTargets = targets.length;

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2))
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for storing Telugu language learner profile data. Processes audio through ASR and evaluates pronunciation accuracy.',
    schema: {
      type: 'object',
      properties: {
        original_text: {
          type: 'string',
          example: 'షాపు దగ్గరే ఆకాశ ఇల్లు',
          description: 'The original Telugu text that the learner is attempting to read',
        },
        audio: {
          type: 'string',
          example: 'base64_encoded_audio_string',
          description: 'Base64 encoded WAV audio file of the learner reading the text',
        },
        session_id: {
          type: 'string',
          example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6',
          description: 'Unique session identifier',
        },
        language: {
          type: 'string',
          example: 'te',
          description: 'Language code (te for Telugu)',
        },
        date: {
          type: 'string',
          format: 'date-time',
          example: '2024-05-07T12:24:51.779Z',
          description: 'Timestamp of the recording',
        },
        sub_session_id: {
          type: 'string',
          example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe',
          description: 'Unique sub-session identifier for grouping related attempts',
        },
        contentId: {
          type: 'string',
          example: 'b70af0e5-0d74-4287-9548-4d491c714b0d',
          description: 'Unique identifier for the content being practiced',
        },
        contentType: {
          type: 'string',
          example: 'Sentence',
          description: 'Type of content (Char, Word, Sentence, Paragraph)',
        },
        mode: {
          type: 'string',
          example: 'online',
          description: 'Processing mode (online/offline)',
        },
      },
      required: ['original_text', 'session_id', 'sub_session_id', 'contentId', 'contentType'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Successfully processed and stored learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'షాపు దగ్గరే ఆకాశ ఇల్లు', description: 'ASR recognized text' },
        subsessionTargetsCount: { type: 'number', example: 17, description: 'Number of target characters in sub-session' },
        subsessionFluency: { type: 'number', example: 1.54, description: 'Fluency score for the sub-session' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while processing or storing learner profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Update learner profile for Telugu language',
    description: 'Processes audio input through ASR (Automatic Speech Recognition) for Telugu language, evaluates pronunciation accuracy, calculates character-level scores, and stores the results in the learner profile. Supports both online and offline processing modes.',
  })
  @Post('/updateLearnerProfile/te')
  async updateLearnerProfileTe(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      let originalText = CreateLearnerProfileDto.original_text;

      let createdAt = new Date().toISOString().replace('Z', '+00:00');
      let ansSelectionStatus = CreateLearnerProfileDto.ansSelectionStatus;

      let createScoreData;

      let correctTokens = [];
      let missingTokens = [];

      let vowelSignArr = [];

      let highSimilarityThreshold = 0.6

      let telguVowelSignArr = [
        'ా',
        'ి',
        'ీ',
        'ు',
        'ూ',
        'ృ',
        'ౄ',
        'ె',
        'ే',
        'ై',
        'ొ',
        'ో',
        'ౌ',
        'ం',
        'ః',
      ];

      let language = 'te';
      vowelSignArr = telguVowelSignArr;

      let responseText = '';
      let prevEle = '';
      let isPrevVowel = false;

      let originalTokenArr = [];
      let responseTokenArr = [];
      let constructTokenArr = [];

      let pause_count = 0;
      let avg_pause = 0;

      let pitch_classification = '';
      let pitch_mean = 0;
      let pitch_std = 0;
      let intensity_classification = '';
      let intensity_mean = 0;
      let intensity_std = 0;
      let expression_classification = '';
      let smoothness_classification = '';

      // This code block used to create tamil compound consonents from text strings
      for (let originalTextELE of originalText.split('')) {
        if (originalTextELE != ' ') {
          if (vowelSignArr.includes(originalTextELE)) {
            if (isPrevVowel) {
              // let prevEleArr = prevEle.split("");
              // prevEle = prevEleArr[0] + originalTextELE;
              // originalTokenArr.push(prevEle);
            } else {
              prevEle = prevEle + originalTextELE;
              originalTokenArr.push(prevEle);
            }
            isPrevVowel = true;
          } else {
            originalTokenArr.push(originalTextELE);
            prevEle = originalTextELE;
            isPrevVowel = false;
          }
        }
      }

      /* Condition to check whether content type is char or not. If content type is char
      dont process it from ASR and other processing related with text evalution matrices and scoring mechanism
      */
      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== 'char') {
        let audioFile;

        if (
          CreateLearnerProfileDto['output'] === undefined &&
          CreateLearnerProfileDto.audio !== undefined
        ) {
          audioFile = CreateLearnerProfileDto.audio;
          const decoded = audioFile.toString('base64');

          // Send Audio file to ASR to process and provide vector with char and score
          let audioOutput = await this.scoresService.audioFileToAsrOutput(
            decoded,
            CreateLearnerProfileDto.language,
            CreateLearnerProfileDto['contentType'],
          );
          CreateLearnerProfileDto['output'] = audioOutput.asrOutBeforeDenoised?.output || '';
          pause_count = audioOutput.pause_count || 0;
          avg_pause = audioOutput.avg_pause;
          pitch_classification = audioOutput.pitch_classification;
          pitch_mean = audioOutput.pitch_mean;
          pitch_std = audioOutput.pitch_std;
          intensity_classification = audioOutput.intensity_classification;
          intensity_mean = audioOutput.intensity_mean;
          intensity_std = audioOutput.intensity_std;
          expression_classification = audioOutput.expression_classification;
          smoothness_classification = audioOutput.smoothness_classification;

          if (CreateLearnerProfileDto.output[0].source === '') {
            await this.persistEmptyAsrLearnerProfile(
              user_id,
              CreateLearnerProfileDto,
              language,
              originalText,
              createdAt,
            );
            throw new BadRequestException({
              code: ErrorCodes.BAD_REQUEST,
              message:
                'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
            });
          }
        }

        let confidence_scoresArr = [];
        let missing_token_scoresArr = [];
        let anomaly_scoreArr = [];
        /*  If the content type is of word ,Generating Constructed text from the ASR Output . From all those constructed combinations
          will be taking the best with similarity score and compare with the original response and choose the best */
        let flag = 0;
        let tokenArr = [];
        let anamolyTokenArr = [];
        let constructTokens = []; // Storing the chars and their scores from the ASR Output for the constructed text
        if (CreateLearnerProfileDto.contentType.toLowerCase() == 'word') {
          // const responseWord = CreateLearnerProfileDto.output[0].source;
          constructTokens = await this.scoresService.processTokens(
            CreateLearnerProfileDto.output[0].nBestTokens,
          );
          const wordsWithValues = await this.scoresService.generateWords(
            constructTokens,
          );

          const hasAgreeableChar =
            originalText.includes("ం") || originalText.includes("ర");

          let forceSimilarityCheck = true;

          if (hasAgreeableChar) {
            const agreeableResults =
              await this.scoresService.replaceCharacters(originalText);

            if (agreeableResults.includes(responseText)) {
              responseText = originalText;

              const splits = splitGraphemes(responseText.toLowerCase()).filter(
                (item) => item && item !== "‌" && item !== " "
              );

              tokenArr = splits.map((item) => ({ [item]: 0.777 }));
              anamolyTokenArr = [];
              forceSimilarityCheck = false;
            }
          }

          if (forceSimilarityCheck) {
            const [
              bestMatch,
              usedArr,
              unusedArr,
              constructedSimilarity,
            ] = await this.scoresService.findAllSimilarities(
              wordsWithValues,
              [originalText]
            );

            const originalSimilarity =
              await this.scoresService.getTextSimilarity(
                CreateLearnerProfileDto.output[0].source,
                originalText
              );

            if (originalSimilarity >= constructedSimilarity) {
              responseText = CreateLearnerProfileDto.output[0].source;
              flag = 1;
            } else {
              responseText = bestMatch;
              tokenArr = usedArr;
              anamolyTokenArr = unusedArr;
            }
          }
        } else {
          //if the response has higher then response will be same as ASR output
          responseText = CreateLearnerProfileDto.output[0].source;
        }

        // Update scores after final responseText is determined
        // Check if original text and final response text are the same or very similar
        const isSameText = CreateLearnerProfileDto.original_text === responseText.replace(/\s+/g, '');
        const similarityScore = await this.scoresService.getTextSimilarity(
          CreateLearnerProfileDto.original_text,
          responseText
        );
        const isHighSimilarity = similarityScore >= highSimilarityThreshold;

        if (isSameText || isHighSimilarity) {
          // Update scores in the selected output
          if (CreateLearnerProfileDto.output[0]?.nBestTokens) {
            CreateLearnerProfileDto.output[0].nBestTokens.forEach((element: any) => {
              element.tokens.forEach((token: any) => {
                const char = Object.keys(token)[0];
                const originalScore = Object.values(token)[0] as number;

                // Update score: 0.7 + original score (make it >= 0.7 so it's not a target)
                const updatedScore = parseFloat((0.7 + (originalScore / 100)).toFixed(4));
                token[char] = updatedScore;
              });
            });
          }

          // Also update scores in tokenArr if it exists
          if (tokenArr && tokenArr.length > 0) {
            tokenArr.forEach((tokenObj: any) => {
              const char = Object.keys(tokenObj)[0];
              const originalScore = Object.values(tokenObj)[0] as number;

              // Update score: 0.7 + original score (make it >= 0.7 so it's not a target)
              const updatedScore = parseFloat((0.7 + (originalScore / 100)).toFixed(4));
              tokenObj[char] = updatedScore;
            });
          }
        }


        let constructText = '';

        // Get All hexcode for this selected language
        let tokenHexcodeData = this.scoresService.gethexcodeMapping(language);
        let tokenHexcodeDataArr = [];

        await tokenHexcodeData.then((tokenHexcodedata: any) => {
          tokenHexcodeDataArr = tokenHexcodedata;
        });

        // Prepare Constructed Text
        let compareCharArr = [];

        let constructTextSet = new Set();

        let reptitionCount = 0;

        for (let originalEle of CreateLearnerProfileDto.original_text.split(
          ' ',
        )) {
          let originalRepCount = 0;
          for (let sourceEle of responseText.split(' ')) {
            let similarityScore = await this.scoresService.getTextSimilarity(
              originalEle,
              sourceEle,
            );
            if (similarityScore >= 0.4) {
              compareCharArr.push({
                original_text: originalEle,
                response_text: sourceEle,
                score: await this.scoresService.getTextSimilarity(
                  originalEle,
                  sourceEle,
                ),
              });
              //break;
            }
            if (similarityScore >= 0.6) {
              originalRepCount++;
            }
          }
          if (originalRepCount >= 2) {
            reptitionCount++;
          }
        }

        for (let compareCharArrEle of compareCharArr) {
          let score = 0;
          let word = '';
          for (let compareCharArrCmpEle of compareCharArr) {
            if (
              compareCharArrEle.original_text ===
              compareCharArrCmpEle.original_text
            ) {
              if (compareCharArrCmpEle.score > score) {
                score = compareCharArrCmpEle.score;
                word = compareCharArrCmpEle.response_text;
              }
            }
          }
          constructTextSet.add(word);
        }

        for (let constructTextSetEle of constructTextSet) {
          constructText += constructTextSetEle + ' ';
        }
        constructText = constructText.trim();

        for (let constructTextELE of constructText.split('')) {
          if (constructTextELE != ' ') {
            if (vowelSignArr.includes(constructTextELE)) {
              if (isPrevVowel) {
                // let prevEleArr = prevEle.split("");
                // prevEle = prevEleArr[0] + responseTextELE;
                // responseTokenArr.push(prevEle);
              } else {
                prevEle = prevEle + constructTextELE;
                constructTokenArr.push(prevEle);
              }
              isPrevVowel = true;
            } else {
              constructTokenArr.push(constructTextELE);
              prevEle = constructTextELE;
              isPrevVowel = false;
            }
          }
        }

        // End Constructed Text Logic

        // Comparison Logic

        for (let originalTokenArrEle of originalTokenArr) {
          if (constructTokenArr.includes(originalTokenArrEle)) {
            correctTokens.push(originalTokenArrEle);
          } else {
            missingTokens.push(originalTokenArrEle);
          }
        }

        let missingTokenSet = new Set(missingTokens);

        missingTokens = Array.from(missingTokenSet);

        let filteredTokenArr = [];

        //token list for ai4bharat response

        // Create Single Array from AI4bharat tokens array
        if (
          CreateLearnerProfileDto.contentType.toLowerCase() != 'word' ||
          flag == 1
        ) {
          CreateLearnerProfileDto.output[0].nBestTokens.forEach((element) => {
            element.tokens.forEach((token) => {
              let key = Object.keys(token)[0];
              let value = Object.values(token)[0];

              let insertObj = {};
              insertObj[key] = value;
              tokenArr.push(insertObj);

              let key1 = Object.keys(token)[1];
              let value1 = Object.values(token)[1];
              insertObj = {};
              insertObj[key1] = value1;
              anamolyTokenArr.push(insertObj);
            });
          });
        }

        let uniqueChar = new Set();
        prevEle = '';
        isPrevVowel = false;

        // Create Unique token array
        for (let tokenArrEle of tokenArr) {
          let tokenString = Object.keys(tokenArrEle)[0];
          for (let keyEle of tokenString.split('')) {
            if (vowelSignArr.includes(keyEle)) {
              if (isPrevVowel) {
                let prevEleArr = prevEle.split('');
                prevEle = prevEleArr[0] + keyEle;
                uniqueChar.add(prevEle);
              } else {
                prevEle = prevEle + keyEle;
                uniqueChar.add(prevEle);
              }
              isPrevVowel = true;
            } else {
              uniqueChar.add(keyEle);
              isPrevVowel = false;
              prevEle = keyEle;
            }
          }
        }

        //unique token list for ai4bharat response
        let uniqueCharArr = Array.from(uniqueChar);
        isPrevVowel = false;

        // Get best score for Each Char
        for (let char of uniqueCharArr) {
          let score = 0.0;
          let prevChar = '';
          let isPrevVowel = false;

          for (let tokenArrEle of tokenArr) {
            let tokenString = Object.keys(tokenArrEle)[0];
            let tokenValue = Object.values(tokenArrEle)[0];

            for (let keyEle of tokenString.split('')) {
              let scoreVal: any = tokenValue;
              let charEle: any = keyEle;

              if (vowelSignArr.includes(charEle)) {
                if (isPrevVowel) {
                  let prevCharArr = prevChar.split('');
                  prevChar = prevCharArr[0] + charEle;
                  charEle = prevChar;
                } else {
                  prevChar = prevChar + charEle;
                  charEle = prevChar;
                }
                isPrevVowel = true;
              } else {
                prevChar = charEle;
                isPrevVowel = false;
              }

              if (char === charEle) {
                if (scoreVal > score) {
                  score = scoreVal;
                }
              }
            }
          }

          filteredTokenArr.push({ charkey: char, charvalue: score });
        }

        // Create confidence score array and anomoly array
        for (let value of filteredTokenArr) {
          let score: any = value.charvalue;

          let identification_status = 0;

          if (score >= 0.9) {
            identification_status = 1;
          } else if (score >= 0.4) {
            identification_status = -1;
          } else {
            identification_status = 0;
          }

          if (value.charkey !== '' && value.charkey !== '▁') {
            if (correctTokens.includes(value.charkey)) {
              let hexcode = getTokenHexcode(value.charkey);

              if (hexcode !== '') {
                confidence_scoresArr.push({
                  token: value.charkey,
                  hexcode: hexcode,
                  confidence_score: value.charvalue,
                  identification_status: identification_status,
                });
              } else {
                if (
                  !missingTokens.includes(value.charkey) &&
                  !constructTokenArr.includes(value.charkey)
                ) {
                  anomaly_scoreArr.push({
                    token: value.charkey.replaceAll('_', ''),
                    hexcode: hexcode,
                    confidence_score: value.charvalue,
                    identification_status: identification_status,
                  });
                }
              }
            }
          }
        }

        for (let missingTokensEle of missingTokenSet) {
          let hexcode = getTokenHexcode(missingTokensEle);

          if (hexcode !== '') {
            if (telguVowelSignArr.includes(missingTokensEle)) {
            } else {
              if (!uniqueChar.has(missingTokensEle)) {
                missing_token_scoresArr.push({
                  token: missingTokensEle,
                  hexcode: hexcode,
                  confidence_score: 0.1,
                  identification_status: 0,
                });
              }
            }
          }
        }

        for (let anamolyTokenArrEle of anamolyTokenArr) {
          let tokenString = Object.keys(anamolyTokenArrEle)[0];
          let tokenValue = Object.values(anamolyTokenArrEle)[0];

          if (tokenString != '') {
            let hexcode = getTokenHexcode(tokenString);
            if (hexcode !== '') {
              if (telguVowelSignArr.includes(tokenString)) {
              } else {
                anomaly_scoreArr.push({
                  token: tokenString.replaceAll('_', ''),
                  hexcode: hexcode,
                  confidence_score: tokenValue,
                  identification_status: 0,
                });
              }
            }
          }
        }

        const url = process.env.ALL_TEXT_EVAL_API + '/getTextMatrices';

        const textData = {
          reference: CreateLearnerProfileDto.original_text,
          hypothesis: CreateLearnerProfileDto.output[0].source,
          language: 'te',
          base64_string: audioFile.toString('base64'),
        };

        const textEvalMatrices = await lastValueFrom(
          this.httpService
            .post(url, JSON.stringify(textData), {
              headers: {
                'Content-Type': 'application/json',
              },
            })
            .pipe(
              map((resp) => resp.data),
              catchError((error: AxiosError) => {
                throw mapAxiosToUpstreamHttpException(
                  'text-eval',
                  ErrorCodes.TEXT_EVAL_UNAVAILABLE,
                  'Text evaluation service is unavailable or returned an error while computing text matrices.',
                  error,
                );
              }),
            ),
        );
        let tempo_classification = textEvalMatrices.tempo_classification;
        let pause_count_textEval = textEvalMatrices.pause_count;
        let words_per_minute = textEvalMatrices.words_per_minute;
        let rate_classification = textEvalMatrices.rate_classification;

        let wer = textEvalMatrices.wer;
        let cercal = textEvalMatrices.cer * 2;
        let charCount = Math.abs(
          CreateLearnerProfileDto.original_text.length - responseText.length,
        );
        let wordCount = Math.abs(
          CreateLearnerProfileDto.original_text.split(' ').length -
          responseText.split(' ').length,
        );
        let repetitions = reptitionCount;
        let pauseCount = pause_count;
        let ins = textEvalMatrices.insertion.length;
        let del = textEvalMatrices.deletion.length;
        let sub = textEvalMatrices.substitution.length;

        let fluencyScore =
          (wer * 5 +
            cercal * 10 +
            charCount * 10 +
            wordCount * 10 +
            repetitions * 10 +
            pauseCount * 10 +
            ins * 20 +
            del * 15 +
            sub * 5) /
          100;

        let accuracy_classification =
          this.scoresService.getAccuracyClassification(
            CreateLearnerProfileDto.contentType,
            fluencyScore,
          );

        createScoreData = {
          user_id: user_id, // userid sent by client
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '', // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || '', // contentId of original text content shown to user to speak
            createdAt: createdAt,
            language: language, // content language
            original_text: CreateLearnerProfileDto.original_text, // content text shown to speak
            response_text: responseText, // text return by ai after converting audio to text
            construct_text: constructText, // this will be constructed by matching response text with original text.
            confidence_scores: confidence_scoresArr, // confidence score array will include char's has identified by ai and has score
            anamolydata_scores: anomaly_scoreArr, // this char's recognise as noise in audio
            missing_token_scores: missing_token_scoresArr, // this char's missed to spoke or recognise by ai
            read_duration: CreateLearnerProfileDto.read_duration, // This is for cal the fluency duration.
            practice_duration: CreateLearnerProfileDto.practice_duration,
            retry_count: CreateLearnerProfileDto.retry_count,
            error_rate: {
              character: textEvalMatrices.cer,
              word: textEvalMatrices.wer,
            },
            count_diff: {
              character: Math.abs(
                CreateLearnerProfileDto.original_text.length -
                responseText.length,
              ),
              word: Math.abs(
                CreateLearnerProfileDto.original_text.split(' ').length -
                responseText.split(' ').length,
              ),
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length,
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length,
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length,
              },
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: textEvalMatrices.pause_count,
            },
            prosody_fluency: {
              pitch: {
                pitch_classification: pitch_classification,
                pitch_mean: pitch_mean,
                pitch_std: pitch_std,
              },
              intensity: {
                intensity_classification: intensity_classification,
                intensity_mean: intensity_mean,
                intensity_std: intensity_std,
              },
              tempo: {
                tempo_classification: tempo_classification,
                words_per_minute: words_per_minute,
                pause_count: pause_count_textEval,
              },
              expression_classification: expression_classification,
              smoothness: {
                smoothness_classification: smoothness_classification,
                pause_count: pause_count,
                avg_pause: avg_pause,
              },
              rate: {
                rate_classification: rate_classification,
                words_per_minute: words_per_minute,
              },
              accuracy: {
                accuracy_classification: accuracy_classification,
                fluencyScore: fluencyScore.toFixed(3),
              },
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false,
          },
        };

        // Store Array to DB
        await this.scoresService.create(createScoreData);

        function getTokenHexcode(token: string) {
          let result = tokenHexcodeDataArr.find((item) => item.token === token);
          return result?.hexcode || '';
        }
      } else {

        createScoreData = {
          user_id: user_id,
          session: {
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || '',
            createdAt: createdAt,
            language: language,
            original_text: originalText,
            response_text: responseText,
            ansSelectionStatus: CreateLearnerProfileDto.ansSelectionStatus,
          },
        };

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);

      }

      // All 3 post-save queries are independent — run in parallel
      let [targets, originalTextSyllables, fluency] = await Promise.all([
        this.scoresService.getTargetsBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
        this.scoresService.getSubsessionOriginalTextSyllables(user_id, CreateLearnerProfileDto.sub_session_id),
        this.scoresService.getFluencyBysubSession(
          user_id,
          CreateLearnerProfileDto.sub_session_id,
          CreateLearnerProfileDto.language,
        ),
      ]);
      targets = targets.filter((targetsEle) => originalTextSyllables.includes(targetsEle.character));
      const totalTargets = targets.length;

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
        ansSelectionStatus: ansSelectionStatus ? ansSelectionStatus : {}
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiParam({
    name: 'sessionId',
    description: 'The unique session identifier',
    example: '20200765061699008295109',
  })
  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @Get('/GetTargets/session/:sessionId')
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved target characters for the session',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string', example: 'கி' },
          latestScores: {
            type: 'array',
            items: { type: 'number', example: 0.1 },
          },
          countBelowThreshold: { type: 'number', example: 1 },
          countAboveThreshold: { type: 'number', example: 0 },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while giving the targets',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Get target characters by session ID',
    description: 'Retrieves a list of target characters that the learner needs to practice, calculated based on performance data from the entire session.',
  })
  async GetTargetsbySession(
    @Param('sessionId') id: string,
    @Query('language') language: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const targetResult = await this.scoresService.getTargetsBySession(
        id,
        language,
      );
      return response.status(HttpStatus.OK).send(targetResult);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @Public()
  @Get('/GetTargets/user/:userId')
  @ApiParam({
    name: 'userId',
    description: 'The unique user identifier',
    example: '8819167684',
  })
  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @ApiQuery({
    name: 'user_id',
    required: true,
    description: 'The user ID to fetch targets for',
    example: '8819167684',
  })
  @ApiOperation({
    summary: 'Get target characters by user ID',
    description: 'Retrieves a list of target characters that the learner needs to practice, calculated based on overall user performance data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved target characters for the user',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string', example: 'ம்' },
          score: { type: 'number', example: 0.32 },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while giving the targets',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  async GetTargetsbyUser(
    @Req() request: FastifyRequest,
    @Query('language') language: string,
    @Query('user_id') user_id: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const targetResult = await this.scoresService.getTargetsByUser(
        user_id,
        language,
      );
      return response.status(HttpStatus.OK).send(targetResult);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiParam({
    name: 'subsessionId',
    description: 'The unique sub-session identifier',
    example: '2020076506',
  })
  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @Get('/GetTargets/subsession/:subsessionId')
  @ApiOperation({
    summary: 'Get target characters by sub-session ID',
    description: 'Retrieves a list of target characters that the learner needs to practice, calculated based on performance data from a specific sub-session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved target characters for the sub-session',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string', example: 'க' },
          latestScores: {
            type: 'array',
            items: { type: 'number', example: 0.1 },
          },
          countBelowThreshold: { type: 'number', example: 1 },
          countAboveThreshold: { type: 'number', example: 0 },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while giving the targets',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  async GetTargetsbysubsession(
    @Param('userId') user_id: string,
    @Param('subsessionId') id: string,
    @Query('language') language: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const targetResult = await this.scoresService.getTargetsBysubSession(
        user_id,
        id,
        language,
      );
      return response.status(HttpStatus.OK).send(targetResult);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiParam({
    name: 'subsessionId',
    description: 'The unique sub-session identifier',
    example: '2020076506',
  })
  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @Get('/GetFamiliarity/subsession/:subsessionId')
  @ApiOperation({
    summary: 'Get familiarity characters by sub-session ID',
    description: 'Retrieves a list of characters the learner is familiar with, calculated based on performance data from a specific sub-session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved familiarity characters for the sub-session',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string', example: 'm' },
          latestScores: {
            type: 'array',
            items: { type: 'number', example: 0.99 },
          },
          countBelowThreshold: { type: 'number', example: 0 },
          countAboveThreshold: { type: 'number', example: 1 },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while giving the familiarity',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  async GetFamiliaritybysubsession(
    @Param('userId') user_id: string,
    @Param('subsessionId') id: string,
    @Query('language') language: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const familiarityResult =
        await this.scoresService.getFamiliarityBysubSession(
          user_id,
          id,
          language,
        );
      return response.status(HttpStatus.OK).send(familiarityResult);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiParam({
    name: 'sessionId',
    description: 'The unique session identifier',
    example: '20200765061699008295109',
  })
  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @Get('/GetFamiliarity/session/:sessionId')
  @ApiOperation({
    summary: 'Get familiarity characters by session ID',
    description: 'Retrieves a list of characters the learner is familiar with, calculated based on performance data from the entire session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved familiarity characters for the session',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string', example: 'பூ' },
          latestScores: {
            type: 'array',
            items: { type: 'number', example: 0.998 },
          },
          countBelowThreshold: { type: 'number', example: 0 },
          countAboveThreshold: { type: 'number', example: 1 },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while giving the familiarity',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  async GetFamiliarityBysession(
    @Param('sessionId') id: string,
    @Query('language') language: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const familiarityResult =
        await this.scoresService.getFamiliarityBySession(id, language);
      return response.status(HttpStatus.OK).send(familiarityResult);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @Get('/GetFamiliarity/user')
  @ApiOperation({
    summary: 'Get familiarity characters by authenticated user',
    description: 'Retrieves a list of characters the authenticated learner is familiar with, calculated based on overall user performance data. User ID is extracted from the JWT token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved familiarity characters for the user',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string', example: 'ரா' },
          score: { type: 'number', example: 0.1 },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while giving the familiarity',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  async GetFamiliarityByUser(
    @Req() request: FastifyRequest,
    @Query('language') language: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      const familiarityResult = await this.scoresService.getFamiliarityByUser(
        user_id,
        language,
      );
      return response.status(HttpStatus.OK).send(familiarityResult);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @Get('GetContent/char')
  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @ApiQuery({
    name: 'contentlimit',
    required: false,
    description: 'Maximum number of content items to return (default: 5, min: 5, max: 20)',
    example: 5,
  })
  @ApiQuery({
    name: 'gettargetlimit',
    required: false,
    description: 'Maximum number of target characters to consider (default: 5)',
    example: 5,
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: 'Comma-separated list of tags to filter content',
    example: 'tag1,tag2',
  })
  @ApiOperation({
    summary: 'Get character content for user practice',
    description: 'Retrieves a set of characters for the user to practice, based on target characters identified from the learner AI profile and content algorithm.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved character content for the user',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'array', items: { type: 'object' }, description: 'Array of content items for practice' },
        getTargetChar: { type: 'array', items: { type: 'string' }, description: 'Array of target characters' },
      },
    },
  })
  async GetContentCharbyUser(
    @Req() request: FastifyRequest,
    @Query('language') language: string,
    @Query() { contentlimit = 5 },
    @Query() { gettargetlimit = 5 },
    @Query(
      'tags',
      new ParseArrayPipe({ items: String, separator: ',', optional: true }),
    )
    tags: string[],
    @Res() response: FastifyReply,
  ) {
    try {
      const id = (request as any).user.virtual_id.toString();
      let currentLevel = 'm0';
      const recordData: any = await this.scoresService.getlatestmilestone(
        id,
        language,
      );
      currentLevel = recordData[0]?.milestone_level || 'm0';

      const getGetTarget = await this.scoresService.getTargetsByUser(
        id,
        language,
      );
      const validations = await this.scoresService.getAssessmentRecordsUserid(
        id,
      );
      const tokenHexcodeData = await this.scoresService.gethexcodeMapping(
        language,
      );

      let getGetTargetCharArr = getGetTarget
        .filter((getGetTargetEle, index) => {
          if (gettargetlimit > 0 && index >= gettargetlimit) {
            return false;
          }
          return true;
        })
        .map((charData) => {
          return charData.character;
        });

      const totalTargets = getGetTarget.length;
      const totalValidation = validations.length;

      let contentLevel = '';
      let complexityLevel = [];

      if (currentLevel === 'm0') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm1') {
        contentLevel = 'L1';
      } else if (currentLevel === 'm2') {
        contentLevel = 'L2';
        complexityLevel = ['C1'];
      } else if (currentLevel === 'm3') {
        contentLevel = 'L2';
        complexityLevel = ['C1', 'C2'];
      } else if (currentLevel === 'm4') {
        contentLevel = 'L3';
        complexityLevel = ['C1', 'C2', 'C3'];
      } else if (currentLevel === 'm5') {
        contentLevel = 'L3';
        complexityLevel = ['C2', 'C3'];
      } else if (currentLevel === 'm6') {
        contentLevel = 'L4';
        complexityLevel = ['C2', 'C3'];
      } else if (currentLevel === 'm7') {
        contentLevel = 'L4';
        complexityLevel = ['C2', 'C3', 'C4'];
      } else if (currentLevel === 'm8') {
        contentLevel = 'L5';
        complexityLevel = ['C3', 'C4'];
      } else if (currentLevel === 'm9') {
        contentLevel = 'L6';
        complexityLevel = ['C3', 'C4'];
      }

      const graphemesMappedObj = {};
      const graphemesMappedArr = [];

      if (language === 'en') {
        getGetTargetCharArr.forEach((getGetTargetCharArrEle) => {
          const tokenGraphemes = getTokenGraphemes(getGetTargetCharArrEle);
          graphemesMappedObj[getGetTargetCharArrEle] = tokenGraphemes;
          graphemesMappedArr.push(...tokenGraphemes);
        });
      }

      const url = process.env.ALL_CONTENT_SERVICE_API;

      // Add the check for the limit
      if (contentlimit < 5) {
        contentlimit = 5;
      } else if (contentlimit > 20) {
        contentlimit = 20;
      }

      const textData = {
        tokenArr: getGetTargetCharArr,
        language: language || 'ta',
        contentType: 'char',
        limit: contentlimit || 5,
        tags: tags,
        cLevel: contentLevel,
        complexityLevel: complexityLevel,
        graphemesMappedObj: graphemesMappedObj,
      };

      const newContent = await lastValueFrom(
        this.httpService
          .post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
              Authorization: request.headers.authorization,
            },
          })
          .pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw mapAxiosToUpstreamHttpException(
                'content-service',
                ErrorCodes.CONTENT_SERVICE_UNAVAILABLE,
                'Content service is unavailable or returned an error.',
                error,
              );
            }),
          ),
      );

      let contentArr;
      let contentForTokenArr;

      if (newContent.data.hasOwnProperty('wordsArr')) {
        contentArr = newContent.data.wordsArr;
      } else {
        contentArr = [];
      }

      if (newContent.data.hasOwnProperty('contentForToken')) {
        contentForTokenArr = newContent.data.contentForToken;
      } else {
        contentForTokenArr = [];
      }

      if (language === 'en') {
        getGetTargetCharArr = graphemesMappedArr;
      }

      function getTokenGraphemes(token: string) {
        const result = tokenHexcodeData.find(
          (item) => item.token.trim() === token.trim(),
        );
        return result?.graphemes || '';
      }

      return response.status(HttpStatus.OK).send({
        content: contentArr,
        contentForToken: contentForTokenArr,
        getTargetChar: getGetTargetCharArr,
        totalTargets: totalTargets,
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @Get('GetContent/word')
  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @ApiQuery({
    name: 'contentlimit',
    required: false,
    description: 'Maximum number of content items to return (max: 20)',
    example: 5,
  })
  @ApiQuery({
    name: 'gettargetlimit',
    required: false,
    description: 'Maximum number of target characters to consider (default: 5)',
    example: 5,
  })
  @ApiQuery({
    name: 'multilingual',
    required: false,
    description: 'Flag to enable multilingual content',
    example: 'true',
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: 'Comma-separated list of tags to filter content',
    example: 'tag1,tag2',
  })
  @ApiOperation({
    summary: 'Get word content for user practice',
    description: 'Retrieves a set of words for the user to practice, based on target characters identified from the learner AI profile and content algorithm.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved word content for the user',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'array', items: { type: 'object' }, description: 'Array of word content items for practice' },
        getTargetChar: { type: 'array', items: { type: 'string' }, description: 'Array of target characters' },
        totalTargets: { type: 'number', description: 'Total number of target characters' },
      },
    },
  })
  async GetContentWordbyUser(
    @Req() request: FastifyRequest,
    @Query('language') language: string,
    @Query('contentlimit') contentlimit: number,
    @Query('multilingual') multilingual: string,
    @Query() { gettargetlimit = 5 },
    @Query(
      'tags',
      new ParseArrayPipe({ items: String, separator: ',', optional: true }),
    )
    tags: string[],
    @Res() response: FastifyReply,
  ) {
    try {
      const id = (request as any).user.virtual_id.toString();
      const graphemesMappedObj = {};
      const graphemesMappedArr = [];

      const recordData: any = await this.scoresService.getlatestmilestone(
        id,
        language,
      );
      const getGetTarget = await this.scoresService.getTargetsByUser(
        id,
        language,
      );

      let currentLevel = 'm0';
      currentLevel = recordData[0]?.milestone_level || 'm0';
      const totalTargets = getGetTarget.length;
      let targetsLimit = gettargetlimit * 2;

      let getGetTargetCharArr = getGetTarget
        .filter((getGetTargetEle, index) => {
          if (targetsLimit > 0 && index >= targetsLimit) {
            return false;
          }
          return true;
        })
        .map((charData) => {
          return charData.character;
        });

      let contentComplexityLevel =
        await this.scoresService.getMilestoneBasedContentComplexity(
          currentLevel,
        );

      let contentLevel = contentComplexityLevel.contentLevel;
      let complexityLevel = contentComplexityLevel.complexityLevel;

      if (language === 'en') {
        const tokenHexcodeData = await this.scoresService.gethexcodeMapping(
          language,
        );

        getGetTargetCharArr.forEach((getGetTargetCharArrEle) => {
          const tokenGraphemes = getTokenGraphemes(getGetTargetCharArrEle);
          graphemesMappedObj[getGetTargetCharArrEle] = tokenGraphemes;
          graphemesMappedArr.push(...tokenGraphemes);
        });

        getGetTargetCharArr = graphemesMappedArr;

        function getTokenGraphemes(token: string) {
          const result = tokenHexcodeData.find(
            (item) => item.token.trim() === token.trim(),
          );
          return result?.graphemes || '';
        }
      }

      const url = process.env.ALL_CONTENT_SERVICE_API;

      // Add the check for the limit
      if (contentlimit > 20) {
        contentlimit = 20;
      }

      const textData = {
        tokenArr: getGetTargetCharArr,
        language: language || 'ta',
        contentType: 'Word',
        limit: contentlimit || 5,
        multilingual: multilingual,
        tags: tags || [],
        cLevel: contentLevel,
        complexityLevel: complexityLevel,
        graphemesMappedObj: graphemesMappedObj,
      };

      const newContent = await lastValueFrom(
        this.httpService
          .post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
              Authorization: request.headers.authorization,
            },
          })
          .pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw mapAxiosToUpstreamHttpException(
                'content-service',
                ErrorCodes.CONTENT_SERVICE_UNAVAILABLE,
                'Content service is unavailable or returned an error.',
                error,
              );
            }),
          ),
      );

      let contentArr;
      let contentForTokenArr;

      if (newContent.data.hasOwnProperty('wordsArr')) {
        contentArr = newContent.data.wordsArr;
      } else {
        contentArr = [];
      }

      if (newContent.data.hasOwnProperty('contentForToken')) {
        contentForTokenArr = newContent.data.contentForToken;
      } else {
        contentForTokenArr = [];
      }

      // Filter out multilingual data if multilingual is false
      if (multilingual !== 'true') {
        contentArr = contentArr.map((contentObject) => {
          const { multilingual, ...contentWithoutMultilingual } = contentObject;
          return contentWithoutMultilingual;
        });
      }

      // Total Syllable count added
      let totalSyllableCount = 0;
      if (language === 'en') {
        contentArr.forEach((contentObject) => {
          totalSyllableCount +=
            contentObject.contentSourceData[0].phonemes.length;
        });
      } else {
        contentArr.forEach((contentObject) => {
          totalSyllableCount +=
            contentObject.contentSourceData[0].syllableCount;
        });
      }

      return response.status(HttpStatus.OK).send({
        content: contentArr,
        contentForToken: contentForTokenArr,
        getTargetChar: getGetTargetCharArr,
        totalTargets: totalTargets,
        totalSyllableCount: totalSyllableCount,
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @Get('GetContent/sentence')
  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @ApiQuery({
    name: 'contentlimit',
    required: false,
    description: 'Maximum number of content items to return (max: 20)',
    example: 5,
  })
  @ApiQuery({
    name: 'gettargetlimit',
    required: false,
    description: 'Maximum number of target characters to consider (default: 5)',
    example: 5,
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: 'Comma-separated list of tags to filter content',
    example: 'tag1,tag2',
  })
  @ApiQuery({
    name: 'mechanics_id',
    required: false,
    description: 'Mechanics identifier for filtering content',
    example: 'mechanics_001',
  })
  @ApiQuery({
    name: 'level_competency',
    required: false,
    description: 'Comma-separated list of competency levels',
    example: 'L1,L2',
  })
  @ApiQuery({
    name: 'story_mode',
    required: false,
    description: 'Flag to enable story mode content',
    example: 'true',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Content category filter',
    example: 'general',
  })
  @ApiQuery({
    name: 'type_of_learner',
    required: false,
    description: 'Type of learner for personalized content',
    example: 'beginner',
  })
  @ApiQuery({
    name: 'CEFR_level',
    required: false,
    description: 'Comma-separated list of CEFR levels',
    example: 'A1,A2',
  })
  @ApiQuery({
    name: 'multilingual',
    required: false,
    description: 'Flag to enable multilingual content',
    example: 'true',
  })
  @ApiOperation({
    summary: 'Get sentence content for user practice',
    description: 'Retrieves a set of sentences for the user to practice, based on target characters identified from the learner AI profile and content algorithm. Supports various filters like mechanics, competency level, and CEFR level.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved sentence content for the user',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'array', items: { type: 'object' }, description: 'Array of sentence content items for practice' },
        getTargetChar: { type: 'array', items: { type: 'string' }, description: 'Array of target characters' },
        totalTargets: { type: 'number', description: 'Total number of target characters' },
      },
    },
  })
  async GetContentSentencebyUser(
    @Req() request: FastifyRequest,
    @Query('language') language,
    @Query('contentlimit') contentlimit: number,
    @Query() { gettargetlimit = 5 },
    @Query(
      'tags',
      new ParseArrayPipe({ items: String, separator: ',', optional: true }),
    )
    tags: string[],
    @Query('mechanics_id') mechanics_id,
    @Query(
      'level_competency',
      new ParseArrayPipe({ items: String, separator: ',', optional: true }),
    )
    level_competency: string[],
    @Query('story_mode') story_mode,
    @Query('category') category: string,
    @Query('type_of_learner') type_of_learner: string,
    @Query(
      'CEFR_level',
      new ParseArrayPipe({ items: String, separator: ',', optional: true }),
    )
    CEFR_level: string[],
    @Query('multilingual') multilingual: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const id = (request as any).user.virtual_id.toString();
      const graphemesMappedObj = {};
      const graphemesMappedArr = [];

      const recordData: any = await this.scoresService.getlatestmilestone(
        id,
        language,
      );
      const getGetTarget = await this.scoresService.getTargetsByUser(
        id,
        language,
      );

      let currentLevel = 'm0';
      currentLevel = recordData[0]?.milestone_level || 'm0';
      const totalTargets = getGetTarget.length;
      let targetsLimit = gettargetlimit * 2;

      let getGetTargetCharArr = getGetTarget
        .filter((getGetTargetEle, index) => {
          if (targetsLimit > 0 && index >= targetsLimit) {
            return false;
          }
          return true;
        })
        .map((charData) => {
          return charData.character;
        });

      let contentComplexityLevel =
        await this.scoresService.getMilestoneBasedContentComplexity(
          currentLevel,
        );

      let contentLevel = contentComplexityLevel.contentLevel;
      let complexityLevel = contentComplexityLevel.complexityLevel;

      if (language === 'en') {
        const tokenHexcodeData = await this.scoresService.gethexcodeMapping(
          language,
        );

        getGetTargetCharArr.forEach((getGetTargetCharArrEle) => {
          const tokenGraphemes = getTokenGraphemes(getGetTargetCharArrEle);
          graphemesMappedObj[getGetTargetCharArrEle] = tokenGraphemes;
          graphemesMappedArr.push(...tokenGraphemes);
        });

        getGetTargetCharArr = graphemesMappedArr;

        function getTokenGraphemes(token: string) {
          const result = tokenHexcodeData.find(
            (item) => item.token.trim() === token.trim(),
          );
          return result?.graphemes || '';
        }
      }

      const url = process.env.ALL_CONTENT_SERVICE_API;

      // Add the check for the limit
      if (contentlimit > 20) {
        contentlimit = 20;
      }

      const textData = {
        tokenArr: getGetTargetCharArr,
        language: language || 'ta',
        contentType: 'Sentence',
        limit: Number(contentlimit) || 5,
        tags: tags || [],
        cLevel: contentLevel,
        complexityLevel: complexityLevel,
        graphemesMappedObj: graphemesMappedObj,
        mechanics_id: mechanics_id,
        level_competency: level_competency || [],
        CEFR_level: CEFR_level || [],
        story_mode: story_mode || false,
        multilingual: multilingual,
      };

      const newContent = await lastValueFrom(
        this.httpService
          .post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
              Authorization: request.headers.authorization,
            },
          })
          .pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw mapAxiosToUpstreamHttpException(
                'content-service',
                ErrorCodes.CONTENT_SERVICE_UNAVAILABLE,
                'Content service is unavailable or returned an error.',
                error,
              );
            }),
          ),
      );

      let contentArr;
      let contentForTokenArr;

      if (newContent.data.hasOwnProperty('wordsArr')) {
        contentArr = newContent.data.wordsArr;
      } else {
        contentArr = [];
      }

      if (newContent.data.hasOwnProperty('contentForToken')) {
        contentForTokenArr = newContent.data.contentForToken;
      } else {
        contentForTokenArr = [];
      }


      // Total Syllable count added
      let totalSyllableCount = 0;
      if (language === 'en') {
        contentArr.forEach((contentObject) => {
          totalSyllableCount +=
            contentObject.contentSourceData[0].phonemes.length;
        });
      } else {
        contentArr.forEach((contentObject) => {
          totalSyllableCount +=
            contentObject.contentSourceData[0].syllableCount;
        });
      }

      return response.status(HttpStatus.OK).send({
        content: contentArr,
        contentForToken: contentForTokenArr,
        getTargetChar: getGetTargetCharArr,
        totalTargets: totalTargets,
        totalSyllableCount: totalSyllableCount,
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @Get('GetContent/paragraph')
  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @ApiQuery({
    name: 'contentlimit',
    required: false,
    description: 'Maximum number of content items to return (default: 5)',
    example: 5,
  })
  @ApiQuery({
    name: 'gettargetlimit',
    required: false,
    description: 'Maximum number of target characters to consider (default: 5)',
    example: 5,
  })
  @ApiQuery({
    name: 'tags',
    required: false,
    description: 'Comma-separated list of tags to filter content',
    example: 'tag1,tag2',
  })
  @ApiQuery({
    name: 'multilingual',
    required: false,
    description: 'Flag to enable multilingual content',
    example: 'true',
  })
  @ApiOperation({
    summary: 'Get paragraph content for user practice',
    description: 'Retrieves a set of paragraphs for the user to practice, based on target characters identified from the learner AI profile and content algorithm.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved paragraph content for the user',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'array', items: { type: 'object' }, description: 'Array of paragraph content items for practice' },
        getTargetChar: { type: 'array', items: { type: 'string' }, description: 'Array of target characters' },
        totalTargets: { type: 'number', description: 'Total number of target characters' },
      },
    },
  })
  async GetContentParagraphbyUser(
    @Req() request: FastifyRequest,
    @Query('language') language,
    @Query() { contentlimit = 5 },
    @Query() { gettargetlimit = 5 },
    @Query(
      'tags',
      new ParseArrayPipe({ items: String, separator: ',', optional: true }),
    )
    tags: string[],
    @Query('multilingual') multilingual: string,
    @Res() response: FastifyReply,
  ) {

    try {
      const id = (request as any).user.virtual_id.toString();
      const graphemesMappedObj = {};
      const graphemesMappedArr = [];

      const recordData: any = await this.scoresService.getlatestmilestone(
        id,
        language,
      );
      const getGetTarget = await this.scoresService.getTargetsByUser(
        id,
        language,
      );

      let currentLevel = 'm0';
      currentLevel = recordData[0]?.milestone_level || 'm0';
      const totalTargets = getGetTarget.length;
      let targetsLimit = gettargetlimit * 2;

      let getGetTargetCharArr = getGetTarget
        .filter((getGetTargetEle, index) => {
          if (targetsLimit > 0 && index >= targetsLimit) {
            return false;
          }
          return true;
        })
        .map((charData) => {
          return charData.character;
        });

      let contentComplexityLevel =
        await this.scoresService.getMilestoneBasedContentComplexity(
          currentLevel,
        );

      let contentLevel = contentComplexityLevel.contentLevel;
      let complexityLevel = contentComplexityLevel.complexityLevel;

      if (language === 'en') {
        const tokenHexcodeData = await this.scoresService.gethexcodeMapping(
          language,
        );

        getGetTargetCharArr.forEach((getGetTargetCharArrEle) => {
          const tokenGraphemes = getTokenGraphemes(getGetTargetCharArrEle);
          graphemesMappedObj[getGetTargetCharArrEle] = tokenGraphemes;
          graphemesMappedArr.push(...tokenGraphemes);
        });

        getGetTargetCharArr = graphemesMappedArr;

        function getTokenGraphemes(token: string) {
          const result = tokenHexcodeData.find(
            (item) => item.token.trim() === token.trim(),
          );
          return result?.graphemes || '';
        }
      }

      const url = process.env.ALL_CONTENT_SERVICE_API;

      // Add the check for the limit
      if (contentlimit < 5) {
        contentlimit = 5;
      } else if (contentlimit > 20) {
        contentlimit = 20;
      }

      const textData = {
        tokenArr: getGetTargetCharArr,
        language: language || 'ta',
        contentType: 'Paragraph',
        limit: contentlimit || 5,
        tags: tags || [],
        cLevel: contentLevel,
        complexityLevel: complexityLevel,
        graphemesMappedObj: graphemesMappedObj,
        multilingual: multilingual,
      };

      const newContent = await lastValueFrom(
        this.httpService
          .post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
              Authorization: request.headers.authorization,
            },
          })
          .pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw mapAxiosToUpstreamHttpException(
                'content-service',
                ErrorCodes.CONTENT_SERVICE_UNAVAILABLE,
                'Content service is unavailable or returned an error.',
                error,
              );
            }),
          ),
      );

      let contentArr;
      let contentForTokenArr;

      if (newContent.data.hasOwnProperty('wordsArr')) {
        contentArr = newContent.data.wordsArr;
      } else {
        contentArr = [];
      }

      if (newContent.data.hasOwnProperty('contentForToken')) {
        contentForTokenArr = newContent.data.contentForToken;
      } else {
        contentForTokenArr = [];
      }

      // Total Syllable count added
      let totalSyllableCount = 0;
      if (language === 'en') {
        contentArr.forEach((contentObject) => {
          totalSyllableCount +=
            contentObject.contentSourceData[0].phonemes.length;
        });
      } else {
        contentArr.forEach((contentObject) => {
          totalSyllableCount +=
            contentObject.contentSourceData[0].syllableCount;
        });
      }

      return response.status(HttpStatus.OK).send({
        content: contentArr,
        contentForToken: contentForTokenArr,
        getTargetChar: getGetTargetCharArr,
        totalTargets: totalTargets,
        totalSyllableCount: totalSyllableCount,
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for calculating session result based on sub-session performance. The result is calculated based on target characters and content type. Collection ID is used to identify discovery sets for milestone level updates.',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          example: '86354440621701972584385',
          description: 'The session identifier',
        },
        sub_session_id: {
          type: 'string',
          example: '86354440621701972584385',
          description: 'The sub-session identifier (required for calculating targets)',
        },
        language: {
          type: 'string',
          example: 'ta',
          description: 'Language code (e.g., en, ta, hi, gu, or, kn, te)',
        },
        contentType: {
          type: 'string',
          example: 'Sentence',
          description: 'Type of content (Char, Word, Sentence, Paragraph)',
        },
        collectionId: {
          type: 'string',
          example: '5221f84c-8abb-4601-a9d0-f8d8dd496566',
          description: 'Collection ID for discovery sets (optional, used for milestone updates)',
        },
        totalSyllableCount: {
          type: 'number',
          example: 50,
          description: 'Total syllable count for English language content (optional)',
        },
        is_mechanics: {
          type: 'boolean',
          example: false,
          description: 'Flag to indicate if mechanics evaluation should be applied',
        },
        max_level: {
          type: 'string',
          example: 'm9',
          description: 'Maximum milestone level allowed (optional)',
        },
      },
      required: ['session_id', 'sub_session_id', 'language', 'contentType'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Successfully calculated session result with target information and milestone level updates',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        sessionResult: { type: 'string', example: 'pass', description: 'Result of the session (pass/fail)' },
        totalTargets: { type: 'number', example: 14, description: 'Total number of target characters' },
        currentLevel: { type: 'string', example: 'm3', description: 'Current milestone level after evaluation' },
        previous_level: { type: 'string', example: 'm0', description: 'Previous milestone level before evaluation' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while calculating sub-session result and milestone level update',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Calculate session result and update milestone level',
    description: 'Calculates pass/fail result based on target character performance in a sub-session. Also handles milestone level updates for discovery and showcase modes. Supports different evaluation criteria based on content type (Char, Word, Sentence, Paragraph) and mechanics.',
  })
  @Post('/getSetResult')
  async getSetResult(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() getSetResult: any,
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      let targetPerThreshold = 30;
      let contentLimit = 5;
      let milestoneEntry = true;
      let totalSyllables = 0;
      let originalTextSyllables = [];
      let is_mechanics = getSetResult.is_mechanics;
      let overallScore, isComprehension;
      let sessionResult = 'No Result';
      let max_level = getSetResult.max_level;
      let hasAnsSelectionStatus = false;
      const setNo = getSetResult.setNo;
      const subSessionId = getSetResult.sub_session_id;
      const requestLanguage = getSetResult.language;

      const [
        getGetSetResultHistory,
        targetsInitial,
        fluency,
        familiarity,
        correct_score,
        subSessionScores,
        recordDataInitial,
        ansSelectionResult,
        originalTextSyllablesResult,
      ] = await Promise.all([
        this.scoresService.getGetSetResultHistory(user_id, getSetResult.session_id, requestLanguage),
        requestLanguage === 'hi'
          ? this.scoresService.getTargetsBysubSessionNew(user_id, subSessionId, requestLanguage)
          : this.scoresService.getTargetsBysubSession(user_id, subSessionId, requestLanguage),
        requestLanguage === 'hi'
          ? this.scoresService.getFluencyBysubSessionNew(user_id, subSessionId, requestLanguage)
          : this.scoresService.getFluencyBysubSession(user_id, subSessionId, requestLanguage),
        requestLanguage === 'hi'
          ? this.scoresService.getFamiliarityBysubSessionNew(user_id, subSessionId, requestLanguage)
          : this.scoresService.getFamiliarityBysubSession(user_id, subSessionId, requestLanguage),
        requestLanguage === 'hi'
          ? this.scoresService.getCorrectnessBysubSessionNew(user_id, subSessionId, requestLanguage)
          : this.scoresService.getCorrectnessBysubSession(user_id, subSessionId, requestLanguage),
        this.scoresService.getComprehensionScore(user_id, subSessionId, requestLanguage),
        requestLanguage === 'hi'
          ? this.scoresService.getlatestmilestoneNew(user_id, requestLanguage).then((m) => (m ? [m] : []))
          : this.scoresService.getlatestmilestone(user_id, requestLanguage),
        requestLanguage === 'hi'
          ? this.scoresService.calculateAnsSelectionResultNew(user_id, getSetResult.session_id, subSessionId, requestLanguage)
          : this.scoresService.calculateAnsSelectionResult(user_id, getSetResult.session_id, subSessionId, requestLanguage),
        requestLanguage !== 'en'
          ? requestLanguage === 'hi'
            ? this.scoresService.getSubsessionOriginalTextSyllablesNew(user_id, subSessionId)
            : this.scoresService.getSubsessionOriginalTextSyllables(user_id, subSessionId)
          : Promise.resolve(null),
      ]);

      const comprehensionResult = await this.scoresService.getComprehensionScore(
        user_id,
        subSessionId,
        requestLanguage,
        subSessionScores,
      );

      let targets = targetsInitial;
      let recordData = recordDataInitial;

      const previousSessionContentType = getGetSetResultHistory?.contentType;
      ({ overallScore, isComprehension } = comprehensionResult);


      if (is_mechanics && isComprehension) {
        if (overallScore >= 14) {
          sessionResult = 'pass';
        } else {
          sessionResult = 'fail';
        }
      }

      if (getSetResult.language != 'en') {
        originalTextSyllables = originalTextSyllablesResult || [];
        targets = targets.filter((targetsEle) => {
          return originalTextSyllables.includes(targetsEle.character);
        });
      }
      let totalTargets = targets.length;

      if (
        getSetResult.totalSyllableCount != undefined &&
        getSetResult.language === 'en'
      ) {
        if (getSetResult.totalSyllableCount > 50) {
          totalSyllables = 50;
        } else {
          totalSyllables = getSetResult.totalSyllableCount;
        }
      } else {
        totalSyllables = totalTargets + familiarity.length;
      }

      let targetsPercentage = totalSyllables > 0
        ? Math.min(Math.floor((totalTargets / totalSyllables) * 100))
        : 0;
      let passingPercentage = Math.floor(100 - targetsPercentage);
      targetsPercentage = targetsPercentage < 0 ? 0 : targetsPercentage;
      passingPercentage = passingPercentage < 0 ? 0 : passingPercentage;

      let previous_level = recordData[0]?.milestone_level || undefined;

      let ansSelectionPercentage = 0;
      // Only override sessionResult if ansSelectionStatus was found (new flow)
      if (ansSelectionResult !== null) {
        sessionResult = ansSelectionResult.result ? 'pass' : 'fail';
        hasAnsSelectionStatus = true;
        ansSelectionPercentage = ansSelectionResult.percentage;
      } else {
        console.log(`[getSetResult] ansSelectionStatus not found, using old flow`);
      }

      // Check if there are no records in the sub-session - should fail
      if (totalSyllables === 0 && !hasAnsSelectionStatus && !isComprehension) {
        console.log('[getSetResult] No records found in sub-session, setting sessionResult to fail');
        sessionResult = 'fail';
      }

      if (totalSyllables <= 100) {
        targetPerThreshold = 30;
      } else if (totalSyllables > 100 && totalSyllables <= 150) {
        targetPerThreshold = 25;
      } else if (totalSyllables > 150 && totalSyllables <= 175) {
        targetPerThreshold = 20;
      } else if (totalSyllables > 175 && totalSyllables <= 250) {
        targetPerThreshold = 15;
      } else if (totalSyllables > 250 && totalSyllables <= 500) {
        targetPerThreshold = 10;
      } else if (totalSyllables > 500) {
        targetPerThreshold = 5;
      }

      // isAnsSesction non_Asr exist
      if (!isComprehension && !hasAnsSelectionStatus && totalSyllables > 0) {
        if (targetsPercentage <= targetPerThreshold) {
          // Add logic for the study the pic mechnics
          if (is_mechanics) {
            let correctness_score = correct_score[0]?.count_scores_gte_50 ?? 0;

            if (correctness_score >= 3) {
              sessionResult = 'pass';
            } else {
              sessionResult = 'fail';
            }
          } else if (getSetResult.contentType.toLowerCase() === 'word') {
            if (fluency < 2) {
              sessionResult = 'pass';
            } else {
              sessionResult = 'fail';
            }
          } else if (getSetResult.contentType.toLowerCase() === 'sentence') {
            if (fluency < 6) {
              sessionResult = 'pass';
            } else {
              sessionResult = 'fail';
            }
          } else if (getSetResult.contentType.toLowerCase() === 'paragraph') {
            if (fluency < 10) {
              sessionResult = 'pass';
            } else {
              sessionResult = 'fail';
            }
          }
        } else {
          sessionResult = 'fail';
        }
      }

      // This preserves old behavior when no evaluation logic matched
      if (sessionResult === 'No Result') {
        sessionResult = 'fail';
      }

      // Require at least 3 successful record
      const minContentThreshold = 3;
      const totalContentCount = correct_score[0]?.total_count ?? 0;
      if (sessionResult === 'pass' && totalContentCount < minContentThreshold) {
        console.log(`[getSetResult] Insufficient content count: ${totalContentCount} < ${minContentThreshold}, overriding sessionResult to fail`);
        sessionResult = 'fail';
      }

      const { fluencyResult, prosodyResult } = await this.scoresService.computeFluencyAndProsodyResults(
        user_id,
        subSessionId,
        requestLanguage,
        getSetResult.collectionId,
        previous_level,
        subSessionScores,
      );

      // If fluencyResult is computed and is 'fail', enforce overall sessionResult to 'fail'
      // But don't override ansSelectionStatus results for char content type
      if (
        !hasAnsSelectionStatus && // Only apply fluency override if we don't have ansSelectionStatus
        ((fluencyResult !== undefined && fluencyResult === SessionResult.FAIL) ||
          (prosodyResult !== undefined && prosodyResult === SessionResult.FAIL))
      ) {
        sessionResult = 'fail';
      }

      let milestone_level = previous_level;


      // For Showcase, We are not sending collectionId based on this are calculating milestone

      if (
        !getSetResult.hasOwnProperty('collectionId') ||
        getSetResult.collectionId === '' ||
        getSetResult?.collectionId === undefined
      ) {
        // Handle B → M1 progression: If user is at B and passes, go to M1
        if (previous_level === 'B' && sessionResult === 'pass') {
          milestone_level = 'm1';
        } else if (sessionResult === 'pass') {
          let previous_level_id =
            previous_level === undefined
              ? 0
              : previous_level === 'B'
                ? 0 // Treat B as equivalent to m0 for progression calculation
                : parseInt(previous_level.replace('m', ''));

          if (
            getSetResult.language === en_config.language_code &&
            previous_level_id >= en_config.max_milestone_level &&
            max_level == undefined
          ) {
            milestone_level = 'm' + en_config.max_milestone_level;
          } else if (
            getSetResult.language === en_config.language_code &&
            previous_level_id >= max_level
          ) {
            milestone_level = 'm' + max_level;
          } else if (
            getSetResult.language === ta_config.language_code &&
            previous_level_id >= ta_config.max_milestone_level
          ) {
            milestone_level = 'm' + ta_config.max_milestone_level;
          } else if (
            getSetResult.language != en_config.language_code &&
            previous_level_id >= ta_config.max_milestone_level
          ) {
            milestone_level = 'm' + ta_config.max_milestone_level;
          } else {
            // Calculate next milestone (would be m1 from m0 or undefined)
            const nextMilestone = 'm' + (previous_level_id + 1);

            // If transitioning from M0 (or undefined) to M1, check is_B_enable
            if (
              nextMilestone === 'm1' &&
              (previous_level === 'm0' || previous_level === undefined) &&
              getSetResult.is_B_enable === true
            ) {
              milestone_level = 'B';
            } else {
              milestone_level = nextMilestone;
            }
          }
        }
      } else {
        // Discovery milestone by setNo 
        if (setNo === 'set4') {
          milestone_level = 'm0';
          if (previous_level === undefined) {
            previous_level = 'm0';
          }
        } else if (setNo === 'set3') {
          if (
            sessionResult === 'pass' &&
            previousSessionContentType === 'Sentence'
          ) {
            milestone_level = 'm3';
          } else if (
            sessionResult === 'fail' &&
            previousSessionContentType === 'Sentence'
          ) {
            milestone_level = 'm2';
          } else if (
            sessionResult === 'pass' &&
            previousSessionContentType === 'Word'
          ) {
            milestone_level = 'm2';
          } else if (
            sessionResult === 'fail' &&
            previousSessionContentType === 'Word'
          ) {
            milestone_level = 'm1';
          }
        } else if (setNo === 'set2') {
          milestoneEntry = false;
        } else if (setNo === 'set5') {
          milestoneEntry = false;
        } else if (setNo === 'set6') {
          if (sessionResult === 'fail') {
            milestone_level = 'm3';
          } else {
            milestone_level = 'm4';
          }
        } else if (setNo === 'set1') {
          if (sessionResult === 'fail') {
            milestone_level = 'B';
          } else {
            milestone_level = 'm1';
          }
        }
      }

      // Apply content type specific milestone logic for discovery (setNo) cases
      if (sessionResult === 'fail') {
        const isM0OrUndefined = previous_level === 'm0' || previous_level === undefined;
        // If user was at B and fails, always stay at B (don't advance to m1)
        if (previous_level === 'B') {
          milestone_level = 'B';
        } else if (
          milestone_level === 'm1' ||
          milestone_level === 'm2' ||
          milestone_level === 'm3' ||
          milestone_level === 'B'
        ) {
          // Preserve milestone set by discovery setNo logic (including B)
        } else if (getSetResult.contentType.toLowerCase() === 'word' && isM0OrUndefined) {
          milestone_level = milestoneEntry ? 'B' : previous_level;
        } else if (getSetResult.contentType.toLowerCase() === 'word') {
          milestone_level = previous_level;
        } else {
          milestone_level = previous_level;
        }
      }

      // Check if is_B_enable is true, then route to milestone B instead of M1
      // Only apply when transitioning from M0 (or undefined) to M1
      // This handles collectionId-based cases where M1 might be set
      if (
        getSetResult.is_B_enable === true &&
        milestone_level === 'm1' &&
        (previous_level === 'm0' || previous_level === undefined || previous_level === null) &&
        (!getSetResult.hasOwnProperty('collectionId') ||
          getSetResult.collectionId === '' ||
          getSetResult.collectionId === undefined)
      ) {
        milestone_level = 'B';
      }

      let currentLevel = milestone_level;

      if (milestoneEntry) {
        let sub_milestone_level = '';
        if (milestone_level === "B" && previous_level === "m0" &&
          (getSetResult.language === "en" || getSetResult.language === "te" || getSetResult.language === "hi" || getSetResult.language === "kn")) {
          sub_milestone_level = 'F1';
        }

        const milestonePayload = {
          user_id: user_id,
          session_id: getSetResult.session_id,
          sub_session_id: getSetResult.sub_session_id,
          milestone_level: milestone_level,
          sub_milestone_level: sub_milestone_level,
          language: getSetResult.language || '',
        };

        if (getSetResult.language === 'hi') {
          // Hindi uses new milestone collection
          const milestoneResult = await this.scoresService.createMilestoneRecordNew(milestonePayload);
          if (milestoneResult?.savedMilestoneLevel) {
            currentLevel = milestoneResult.savedMilestoneLevel;
          }
          const latestMilestone: any = await this.scoresService.getlatestmilestoneNew(user_id, getSetResult.language);
          currentLevel = latestMilestone?.milestone_level || undefined;
          if (currentLevel === undefined) {
            currentLevel = previous_level;
          } else if (getSetResult.contentType.toLowerCase() === 'char') {
            currentLevel = milestoneResult?.savedMilestoneLevel || milestone_level;
          }
        } else {
          await this.scoresService
            .createMilestoneRecord(milestonePayload)
            .then(async (milestoneResult) => {
              if (milestoneResult?.savedMilestoneLevel) {
                currentLevel = milestoneResult.savedMilestoneLevel;
              }
              recordData = await this.scoresService.getlatestmilestone(user_id, getSetResult.language);
              currentLevel = recordData[0]?.milestone_level || undefined;
              if (currentLevel === undefined) {
                currentLevel = previous_level;
              } else if (getSetResult.contentType.toLowerCase() === 'char') {
                currentLevel = milestoneResult?.savedMilestoneLevel || milestone_level;
              }
            });
        }
      }

      // Use ansSelectionPercentage when hasAnsSelectionStatus is true, otherwise use passingPercentage
      const responsePercentage = hasAnsSelectionStatus ? ansSelectionPercentage : (passingPercentage || 0);

      // Fire-and-forget: log without blocking the response.
      this.scoresService.addGetSetResultLog({
        userId: user_id,
        sessionId: getSetResult.session_id,
        subSessionId: getSetResult.sub_session_id,
        sessionResult: sessionResult,
        totalTargets: totalTargets,
        currentLevel: currentLevel,
        previousLevel: previous_level,
        totalSyllables: totalSyllables,
        fluency: fluency,
        percentage: responsePercentage,
        fluencyResult: fluencyResult,
        prosodyResult: prosodyResult,
        targetsPercentage: targetsPercentage,
        langauge: getSetResult.language,
        totalCorrectnessScore:
          (correct_score[0]?.total_correctness_score ?? 0) / contentLimit,
        comprehensionScore: overallScore,
        collectionId: getSetResult.collectionId || "",
        setNo: getSetResult.setNo || "",
        contentType: getSetResult.contentType || "",
      }).catch((logError) => console.error('Failed to log session result:', logError));

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        data: {
          sessionResult: sessionResult,
          totalTargets: totalTargets || 0,
          currentLevel: currentLevel,
          previous_level: previous_level,
          totalSyllables: totalSyllables,
          fluency: fluency,
          fluencyResult: fluencyResult,
          prosodyResult: prosodyResult,
          percentage: responsePercentage,
          targetsPercentage: targetsPercentage || 0,
          total_correctness_score:
            correct_score[0]?.total_correctness_score / contentLimit || 0,
          comprehensionScore: overallScore
        },
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }


  @ApiQuery({
    name: 'language',
    required: true,
    description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
    example: 'ta',
  })
  @ApiOperation({
    summary: 'Get current milestone level of authenticated user',
    description: 'Retrieves the current milestone level for the authenticated user along with additional data including TOWRE results and vocabulary statistics. User ID is extracted from the JWT token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved milestone level with additional user statistics',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'object',
          properties: {
            milestone_level: { type: 'string', example: 'm0', description: 'Current milestone level (m0-m9 or B)' },
            extra: {
              type: 'object',
              properties: {
                latest_towre_data: {
                  type: 'object',
                  description: 'Latest TOWRE (Test of Word Reading Efficiency) data',
                  properties: {
                    wordsPerMinute: { type: 'number', example: 144 },
                    correctWordsCount: { type: 'number', example: 8 },
                    unattemptedWordsCount: { type: 'number', example: 100 },
                    newWordsLearnt: { type: 'number', example: 8 },
                    incorrectWordCount: { type: 'number', example: 0 },
                  },
                },
                vocabulary_count: { type: 'number', example: 0, description: 'Total vocabulary count' },
                learned_voc_count: { type: 'number', example: 10, description: 'Number of learned words' },
                understood_voc_count: { type: 'number', example: 5, description: 'Number of understood words' },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while fetching milestone data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        message: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @Get('/getMilestone')
  async getMilestone(
    @Req() request: FastifyRequest,
    @Query('language') language: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const id = (request as any).user.virtual_id.toString();
      const recordData: any = language === 'hi'
        ? await this.scoresService.getlatestmilestoneNew(id, language).then((m) => (m ? [m] : []))
        : await this.scoresService.getlatestmilestone(id, language);
      // towre data
      const latest_towre_data = await this.scoresService.getTowreData(
        id,
        language,
      );

      const [recordData, latest_towre_data, vocabulary_count, vocabularyStats]: any =
        await Promise.all([
          this.scoresService.getlatestmilestone(id, language),
          this.scoresService.getTowreData(id, language),
          this.scoresService.getVocabularyCount(id, language),
          this.scoresService.getVocabularyStats(id),
        ]);

      // milestone data
      const milestone_level = recordData[0]?.milestone_level || 'm0';
      const sub_milestone_level = recordData[0]?.sub_milestone_level || '';
      const result = {
        status: 'success',
        data: {
          milestone_level: milestone_level,
          sub_milestone_level: sub_milestone_level,
          extra: {
            latest_towre_data,
            vocabulary_count: vocabulary_count,
            learned_voc_count: vocabularyStats.learned_words_count,
            understood_voc_count: vocabularyStats.understood_words_count
          }
        },
      };
      return response.status(HttpStatus.CREATED).send(result);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiExcludeEndpoint(true)
  @Post('/GetMissingChars')
  async GetMissingChars(@Res() response: FastifyReply, @Body() storyData: any) {
    try {
      const data = await this.scoresService.getMissingChars(
        storyData.storyLanguage,
      );

      const storyString = storyData.storyString;

      const tokenArr = storyString.split('');

      const taVowelSignArr = [
        'ா',
        'ி',
        'ீ',
        'ு',
        'ூ',
        'ெ',
        'ே',
        'ை',
        'ொ',
        'ோ',
        'ௌ',
        '்',
      ];

      const vowelSignArr = taVowelSignArr;

      const uniqueChar = new Set();
      const uniqueCharArr = [];
      let prevEle = '';
      let isPrevVowel = false;

      // Create Unique token array
      for (const tokenArrEle of tokenArr) {
        for (const keyEle of tokenArrEle.split('')) {
          if (vowelSignArr.includes(keyEle)) {
            if (isPrevVowel) {
              const prevEleArr = prevEle.split('');
              if (prevEleArr.length) {
                prevEle = prevEleArr[0] + keyEle;
                uniqueCharArr[uniqueCharArr.length - 1] = prevEle;
              }
            } else {
              prevEle = prevEle + keyEle;
              uniqueCharArr[uniqueCharArr.length - 1] = prevEle;
              //uniqueCharArr.push(prevEle);
            }
            isPrevVowel = true;
          } else {
            if (keyEle != ' ') {
              uniqueCharArr.push(keyEle);
            }
            prevEle = keyEle;
            isPrevVowel = false;
          }
        }
      }

      //let uniqueCharArr = Array.from(uniqueChar);
      const matched = uniqueCharArr.filter((element) => data.includes(element));
      const matchtedTotal = matched.length;

      const notIncluded = data.filter((element) => {
        if (!uniqueCharArr.includes(element)) {
          return element;
        }
      });
      const notIncludedTotal = notIncluded.length;

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        matched: matched,
        matchtedTotal: matchtedTotal,
        notIncluded: notIncluded,
        notIncludedTotal: notIncludedTotal,
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiExcludeEndpoint(true)
  @Post('/addAssessmentInput')
  async AddAssessmentInput(
    @Res() response: FastifyReply,
    @Body() assessmentInput: AssessmentInputDto,
  ) {
    try {
      await this.scoresService.assessmentInputCreate(
        assessmentInput,
      );
      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to Assessment Input',
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiExcludeEndpoint(true)

  @Get('/GetSessionIds')
  async GetSessionIdsByUser(
    @Req() request: FastifyRequest,
    @Query() { limit = 5 },
  ) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      return await this.scoresService.getAllSessions(user_id, limit);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }


  @ApiBody({
    description: 'Request body for fetching target characters for multiple users. Targets are characters the learner needs to practice based on their performance data.',
    schema: {
      type: 'object',
      properties: {
        userIds: {
          type: 'array',
          items: {
            type: 'string',
            example: '8297454902',
          },
          description: 'Array of user IDs to fetch targets for',
        },
        language: {
          type: 'string',
          example: 'en',
          description: 'Language code (e.g., en, ta, hi, gu, or, kn, te)',
        },
      },
      required: ['userIds', 'language'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved target data for all specified users',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          user_id: { type: 'string', example: '9131490212', description: 'User identifier' },
          targetData: {
            type: 'array',
            description: 'Array of target characters with their scores',
            items: {
              type: 'object',
              properties: {
                character: { type: 'string', example: 'ளி', description: 'Target character' },
                score: { type: 'number', example: 0.1, description: 'Performance score for this character' },
              },
            },
          },
          targetCount: { type: 'integer', example: 56, description: 'Total number of target characters' },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while fetching the users target data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Get target characters for multiple users',
    description: 'Retrieves target characters (characters that need practice) for multiple users at once. Useful for batch processing or dashboard views.',
  })
  @Post('/getUsersTargets')
  async GetUsersTargets(@Res() response: FastifyReply, @Body() data: any) {
    try {
      const { userIds, language } = data;
      let recordData = [];
      for (const userId of userIds) {
        const userRecord = await this.scoresService.getTargetsByUser(
          userId,
          language,
        );
        recordData.push({
          user_id: userId,
          targetData: userRecord,
          targetCount: userRecord.length,
        });
      }
      return response.status(HttpStatus.OK).send(recordData);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for fetching familiarity characters for multiple users. Familiarity indicates characters the learner has mastered based on their performance data.',
    schema: {
      type: 'object',
      properties: {
        userIds: {
          type: 'array',
          items: {
            type: 'string',
            example: '8297454902',
          },
          description: 'Array of user IDs to fetch familiarity for',
        },
        language: {
          type: 'string',
          example: 'en',
          description: 'Language code (e.g., en, ta, hi, gu, or, kn, te)',
        },
      },
      required: ['userIds', 'language'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved familiarity data for all specified users',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          user_id: { type: 'string', example: '8297454902', description: 'User identifier' },
          familiarityData: {
            type: 'array',
            description: 'Array of familiar characters with performance metrics',
            items: {
              type: 'object',
              properties: {
                character: { type: 'string', example: 'ɪ', description: 'Familiar character' },
                latestScores: {
                  type: 'array',
                  items: { type: 'number', example: 0.99 },
                  description: 'Recent performance scores',
                },
                countBelowThreshold: { type: 'integer', example: 1, description: 'Count of scores below threshold' },
                countAboveThreshold: { type: 'integer', example: 4, description: 'Count of scores above threshold' },
                score: { type: 'number', example: 0.812, description: 'Average familiarity score' },
              },
            },
          },
          familiarityCount: { type: 'integer', example: 5, description: 'Total number of familiar characters' },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while fetching the users familiarity data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Get familiarity characters for multiple users',
    description: 'Retrieves familiarity characters (characters the learner has mastered) for multiple users at once. Useful for batch processing or dashboard views.',
  })
  @Post('/getUsersFamiliarity')
  async GetUsersFamiliarity(@Res() response: FastifyReply, @Body() data: any) {
    try {
      const { userIds, language } = data;
      let recordData = [];
      for (const userId of userIds) {
        const familiarityRecord = await this.scoresService.getFamiliarityByUser(
          userId,
          language,
        );

        recordData.push({
          user_id: userId,
          familiarityData: familiarityRecord,
          familiarityCount: familiarityRecord.length,
        });
      }
      return response.status(HttpStatus.OK).send(recordData);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for fetching milestone levels for multiple users. Milestone levels indicate the learning progress stage (m0-m9 or B) of each user.',
    schema: {
      type: 'object',
      properties: {
        userIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['8635444062', '8635444063'],
          description: 'Array of user IDs to fetch milestone levels for',
        },
        language: {
          type: 'string',
          example: 'ta',
          description: 'Language code (e.g., en, ta, hi, gu, or, kn, te)',
        },
      },
      required: ['userIds', 'language'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved milestone levels for all specified users',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          user_id: { type: 'string', example: '8591582684', description: 'User identifier' },
          data: {
            type: 'object',
            properties: {
              milestone_level: { type: 'string', example: 'm0', description: 'Current milestone level (m0-m9 or B)' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while fetching the users milestone data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Get milestone levels for multiple users',
    description: 'Retrieves current milestone levels for multiple users at once. Milestone levels represent learning progress stages from m0 (beginner) to m9 (advanced) or B (special beginner track).',
  })
  @Post('/getUsersMilestones')
  async getUsersMilestones(@Res() response: FastifyReply, @Body() data: any) {
    try {
      const { userIds, language } = data;
      let recordData = [];
      for (const userId of userIds) {
        let milestoneData: any = await this.scoresService.getlatestmilestone(
          userId,
          language,
        );
        let milestone_level = milestoneData[0]?.milestone_level || 'm0';

        recordData.push({
          user_id: userId,
          data: { milestone_level: milestone_level },
        });
      }
      return response.status(HttpStatus.OK).send(recordData);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for fetching comprehensive user profile data including targets and familiarity organized by sub-sessions.',
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          example: '8635444062',
          description: 'The user ID to fetch profile data for',
        },
        language: {
          type: 'string',
          example: 'ta',
          description: 'Language code (e.g., en, ta, hi, gu, or, kn, te)',
        },
      },
      required: ['userId', 'language'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved comprehensive user profile with target and familiarity data organized by sub-sessions',
    schema: {
      type: 'object',
      properties: {
        Target: {
          type: 'array',
          description: 'Target characters data organized by sub-session',
          items: {
            type: 'object',
            properties: {
              subSessionId: { type: 'string', example: '8635444062', description: 'Sub-session identifier' },
              createdAt: {
                type: 'string',
                format: 'date-time',
                example: '2023-10-16T08:25:43.934Z',
                description: 'Timestamp when the sub-session was created',
              },
              score: {
                type: 'array',
                description: 'Array of target character scores',
                items: {
                  type: 'object',
                  properties: {
                    character: { type: 'string', example: 'd', description: 'Target character' },
                    latestScores: {
                      type: 'array',
                      description: 'Recent performance scores for this character',
                      items: {
                        type: 'object',
                        properties: {
                          score: { type: 'number', example: 0.1 },
                          original_text: { type: 'string', example: 'நீலா பூந்தோ' },
                          response_text: { type: 'string', example: 'நீலா பூந்தோ' },
                          countBelowThreshold: { type: 'number', example: 1 },
                          countAboveThreshold: { type: 'number', example: 5 },
                          avgScore: { type: 'number', example: 0.1 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        Famalarity: {
          type: 'array',
          description: 'Familiarity characters data organized by sub-session',
          items: {
            type: 'object',
            properties: {
              subSessionId: { type: 'string', example: '8635444062', description: 'Sub-session identifier' },
              createdAt: {
                type: 'string',
                format: 'date-time',
                example: '2023-10-16T08:25:43.934Z',
                description: 'Timestamp when the sub-session was created',
              },
              score: {
                type: 'array',
                description: 'Array of familiar character scores',
                items: {
                  type: 'object',
                  properties: {
                    character: { type: 'string', example: 'd', description: 'Familiar character' },
                    latestScores: {
                      type: 'array',
                      description: 'Recent performance scores for this character',
                      items: {
                        type: 'object',
                        properties: {
                          score: { type: 'number', example: 0.9 },
                          original_text: { type: 'string', example: 'நீலா பூந்தோ' },
                          response_text: { type: 'string', example: 'நீலா பூந்தோ' },
                          countBelowThreshold: { type: 'number', example: 0 },
                          countAboveThreshold: { type: 'number', example: 5 },
                          avgScore: { type: 'number', example: 0.9 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while fetching the user profile data',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Get comprehensive user profile with targets and familiarity',
    description: 'Retrieves detailed learner profile data including target and familiarity characters organized by sub-sessions. Provides historical performance data for each character across different learning sessions.',
  })
  @Post('/getUserProfile')
  async GetUserProfile(@Res() response: FastifyReply, @Body() data: any) {
    try {
      const { userId, language } = data;
      let target_Data: any = [];
      let famalarity_Data: any = [];
      const subsessionData: any = await this.scoresService.getSubessionIds(
        userId,
      );

      for (const subsession of subsessionData) {
        const subSessionId = subsession.sub_session_id;
        const createdAt = subsession.createdAt;
        const famalarityData =
          await this.scoresService.getFamiliarityBysubSessionUserProfile(
            subSessionId,
            language,
          );
        if (famalarityData) {
          famalarity_Data.push({
            subSessionId: subSessionId,
            createdAt: createdAt,
            score: famalarityData || [],
          });
        }
        const targetData =
          await this.scoresService.getTargetsBysubSessionUserProfile(
            subSessionId,
            language,
          );
        if (targetData) {
          target_Data.push({
            subSessionId: subSessionId,
            createdAt: createdAt,
            score: targetData || [],
          });
        }
      }
      const finalResponse = {
        Target: target_Data,
        Famalarity: famalarity_Data,
      };
      return response.status(HttpStatus.OK).send(finalResponse);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @ApiBody({
    description: 'Request body for getting content recommendations based on user milestone and content type',
    schema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          example: 'en',
          description: 'Language code for the content (e.g., en, ta, hi, gu, or, kn, te)',
        },
        content_type: {
          type: 'string',
          example: 'Word',
          description: 'Type of content to recommend (e.g., Char, Word, Sentence, Paragraph)',
        },
      },
      required: ['language', 'content_type'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved content recommendations',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              contentId: { type: 'string', example: 'b70af0e5-0d74-4287-9548-4d491c714b0d' },
              content: { type: 'string', example: 'example content' },
              contentType: { type: 'string', example: 'Word' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - missing required fields',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        message: { type: 'string', example: 'Language and content_type are required fields' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error while fetching recommendations',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        message: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({
    summary: 'Get personalized content recommendations for a user based on their milestone level',
    description: 'This API retrieves content recommendations tailored to the user\'s current learning milestone and specified content type. It uses the user\'s progress data to suggest appropriate learning materials.',
  })
  @Post('/getRecommendation')
  async getRecommendation(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() data: any) {
    try {
      const user_id = (request as any).user.virtual_id.toString();
      const language = (request.body as any).language;
      const content_type = (request.body as any).content_type;

      const authHeader = request.headers['authorization'];
      const token = authHeader?.split(' ')[1];

      if (!language || !content_type) {
        throw new BadRequestException({
          code: ErrorCodes.BAD_REQUEST,
          message: 'Language and content_type are required fields',
        });
      }

      let milestoneData: any = await this.scoresService.getlatestmilestone(
        user_id,
        language,
      );
      let milestone_level = milestoneData[0]?.milestone_level || 'm0';

      let recommendationData = await this.scoresService.getRecommendation(
        milestone_level,
        content_type,
        token,
        language
      )

      return response.status(HttpStatus.OK).send(recommendationData);
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @Post('/assessment/create')
  @ApiOperation({ summary: 'Create a new assessment tracking record' })
  @ApiBody({
    description: 'Payload for creating an assessment tracking record',
    type: CreateAssessmentTrackingDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Assessment tracking record created successfully',
    schema: {
      example: {
        status: 'success',
        message: 'Assessment tracking record created successfully',
        data: {
          assessmentTrackingId: 'uuid-here',
          userId: 'user-uuid',
          courseId: 'course-id',
          contentId: 'content-id',
          totalScore: 85,
          totalMaxScore: 100,
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    schema: {
      example: {
        status: 'error',
        message: 'Server error - <error message>',
      },
    },
  })

  async createAssessmentTracking(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() createAssessmentTrackingDto: CreateAssessmentTrackingDto,
  ) {
    try {
      // Extract user_id from authenticated request
      const user_id = (request as any).user.virtual_id.toString();

      // Extract tenantId from request headers if available
      const tenantId =
        (request.headers as any).tenantId ||
        (request.headers as any).tenantid ||
        null;

      const savedRecord = await this.scoresService.createAssessmentTracking(
        createAssessmentTrackingDto,
        tenantId,
        user_id
      );

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        message: 'Assessment tracking record created successfully',
        data: {
          assessmentTrackingId: savedRecord.assessmentTrackingId,
          sessionResult: savedRecord.sessionResult,
          target_syllables: savedRecord.target_char,
          familiarity_syllables: savedRecord.familiarity_char,
        },
      });
    } catch (err) {
      throw mapUnknownToHttpException(err);
    }
  }

  @Post('/milestone/set')
  async setMilestoneManually(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() setMilestoneDto: {
      language: string;
      milestone_level: string;
      sub_milestone_level?: string;
      session_id?: string;
      sub_session_id?: string;
    },
  ) {
    try {
      const user_id = (request as any).user?.virtual_id?.toString();
      if (!user_id) {
        throw new UnauthorizedException({
          code: ErrorCodes.UNAUTHORIZED,
          message: 'User ID not found in token',
        });
      }

      if (!setMilestoneDto.language || !setMilestoneDto.milestone_level) {
        throw new BadRequestException({
          code: ErrorCodes.BAD_REQUEST,
          message:
            'Missing required fields: language and milestone_level are required',
        });
      }

      // Handle F1, F2, F3:
      let finalMilestoneLevel = setMilestoneDto.milestone_level;
      let finalSubMilestoneLevel = setMilestoneDto.sub_milestone_level;

      if (['F1', 'F2', 'F3'].includes(setMilestoneDto.milestone_level.toUpperCase())) {
        finalMilestoneLevel = 'B';
        finalSubMilestoneLevel = setMilestoneDto.milestone_level.toUpperCase();
      }

      // Prepare data with extracted user_id
      const milestoneData = {
        user_id: user_id,
        language: setMilestoneDto.language,
        milestone_level: finalMilestoneLevel,
        sub_milestone_level: finalSubMilestoneLevel,
        session_id: setMilestoneDto.session_id,
        sub_session_id: setMilestoneDto.sub_session_id,
      };

      const result = await this.scoresService.setMilestoneManually(milestoneData);

      if (result.success) {
        return response.status(HttpStatus.OK).send(result);
      }
      const requestId = getOrCreateRequestId(request);
      return response.status(HttpStatus.BAD_REQUEST).send(
        finalizeStandardError(
          HttpStatus.BAD_REQUEST,
          {
            code: ErrorCodes.BAD_REQUEST,
            message: String(
              result.error ?? result.message ?? 'Could not update milestone',
            ),
            errors: [result],
          },
          requestId,
        ),
      );
    } catch (err) {
      console.error('Error in setMilestoneManually:', err);
      throw mapUnknownToHttpException(err);
    }
  }

}

