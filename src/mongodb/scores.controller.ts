import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, Res, Search, Query, ParseArrayPipe, UseGuards, Req } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { CreateLearnerProfileDto } from './dto/CreateLearnerProfile.dto';
import { AssessmentInputDto } from './dto/AssessmentInput.dto';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  ApiBody,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { catchError, lastValueFrom, map } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import ta_config from "./config/language/ta";
import en_config from "./config/language/en"
import { JwtAuthGuard } from 'src/auth/auth.guard';
import gu_config from './config/language/gu';
import or_config from './config/language/or';
import hi_config from './config/language/hi';
import kn_config from './config/language/kn';

@ApiTags('scores')
@UseGuards(JwtAuthGuard)
@Controller('scores')
export class ScoresController {
  constructor(
    private readonly scoresService: ScoresService,
    private readonly httpService: HttpService,
  ) { }

  @ApiBody({
    description: 'Request body for storing data to the learner profile',
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'நேர்மை நிறைந்த தீர்ப்பு' },
        audio: { type: 'string', example: 'Add hindi Wav file base64 string here' },
        user_id: { type: 'string', example: '8819167684' },
        session_id: { type: 'string', example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6' },
        language: { type: 'string', example: 'ta' },
        date: { type: 'string', format: 'date-time', example: '2024-05-07T12:24:51.779Z' },
        sub_session_id: { type: 'string', example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe' },
        contentId: { type: 'string', example: 'b70af0e5-0d74-4287-9548-4d491c714b0d' },
        contentType: { type: 'string', example: 'Sentence' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'நீர்மை நிறந்த தீரு' },
        subsessionTargetsCount: { type: 'number', example: 17 },
        subsessionFluency: { type: 'number', example: 1.54 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
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
    summary:
      'Store students learner ai profile, from the ASR output for a given wav file. This API will work for Tamil',
  })
  @Post('/updateLearnerProfile/ta')
  async updateLearnerProfileTa(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = ((request as any).user.virtual_id).toString();
      const vowelSignArr = ta_config.vowel;
      const language = ta_config.language_code;
      const mode = CreateLearnerProfileDto.mode;
    
      let createScoreData;

      let asrOutDenoised;
      let asrOutBeforeDenoised;

      let nonDenoisedresponseText = "";
      let DenoisedresponseText = "";

      let similarityNonDenoisedText = 0;
      let similarityDenoisedText = 0;

      let constructTokenArr = [];
      let correctTokens = [];
      let missingTokens = [];

      let reptitionCount = 0;

      let confidence_scoresArr = [];
      let missing_token_scoresArr = [];
      let anomaly_scoreArr = [];

      const originalText = CreateLearnerProfileDto.original_text;
      let originalTokenArr = await this.scoresService.getSyllablesFromString(originalText, vowelSignArr, language);

      let responseText = '';
      let constructText = '';

      let pause_count = 0;

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
            let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language, CreateLearnerProfileDto['contentType']);

            asrOutDenoised = audioOutput.asrOutDenoisedOutput?.output || "";
            asrOutBeforeDenoised = audioOutput.asrOutBeforeDenoised?.output || "";
            pause_count = audioOutput.pause_count || 0;

            similarityDenoisedText = await this.scoresService.getTextSimilarity(originalText, asrOutDenoised[0]?.source || "");
            similarityNonDenoisedText = await this.scoresService.getTextSimilarity(originalText, asrOutBeforeDenoised[0]?.source || "");

            if (similarityDenoisedText <= similarityNonDenoisedText) {
              CreateLearnerProfileDto['output'] = asrOutBeforeDenoised;
              DenoisedresponseText = asrOutDenoised[0]?.source;
              nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
            } else {
              CreateLearnerProfileDto['output'] = asrOutDenoised;
              DenoisedresponseText = asrOutDenoised[0]?.source;
              nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
            }

            if (CreateLearnerProfileDto.output[0].source === '') {
              return response.status(HttpStatus.BAD_REQUEST).send({
                status: 'error',
                message:
                  'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
              });
            }
          }
          responseText = CreateLearnerProfileDto.output[0].source;
        }else{
            responseText =CreateLearnerProfileDto.response_text;
            pause_count = CreateLearnerProfileDto.pause_count;
        }


        // Get All hexcode for this selected language
        const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(language);
        // End Get All hexcode for this selected language

        // Constructed Logic starts from here
        let constructedTextRepCountData = await this.scoresService.getConstructedText(originalText, responseText);
        constructText = constructedTextRepCountData.constructText;
        reptitionCount = constructedTextRepCountData.reptitionCount;
        constructTokenArr = await this.scoresService.getSyllablesFromString(constructText, vowelSignArr, language);
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

        let identifyTokens = await this.scoresService.identifyTokens(CreateLearnerProfileDto.output[0].nBestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

        confidence_scoresArr = identifyTokens.confidence_scoresArr;
        missing_token_scoresArr = identifyTokens.missing_token_scoresArr;
        anomaly_scoreArr = identifyTokens.anomaly_scoreArr;

        const textEvalMatrices = await this.scoresService.getTextMetrics(originalText, constructText, language,CreateLearnerProfileDto.audio.toString(('base64')))
        if (mode !== 'offline' && process.env.denoiserEnabled === "true") {
          let improved = false;

          let similarityScoreNonDenoisedResText = similarityNonDenoisedText;
          let similarityScoreDenoisedResText = similarityDenoisedText;

          if (similarityScoreDenoisedResText > similarityScoreNonDenoisedResText) {
            improved = true;
          }

          let createDenoiserOutputLog = {
            user_id: CreateLearnerProfileDto.user_id,
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "",
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || "",
            language: language,
            original_text: originalText,
            response_text: nonDenoisedresponseText,
            denoised_response_text: DenoisedresponseText,
            improved: improved,
            comment: ""
          }

          await this.scoresService.addDenoisedOutputLog(createDenoiserOutputLog);
        }

        let fluencyScore = await this.scoresService.getCalculatedFluency(textEvalMatrices, reptitionCount, originalText, responseText, pause_count);

        let createdAt = new Date().toISOString().replace('Z', '+00:00')

        createScoreData = {
          user_id: CreateLearnerProfileDto.user_id, // userid sent by client
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
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false,
          },
        };
        // For retry attempt detection
        const retryAttempt = await this.scoresService.getRetryStatus(
          CreateLearnerProfileDto.user_id,
          CreateLearnerProfileDto.contentId,
        );

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);
      }

      // Cal the subsessionWise and content_id wise target.
      let targets = await this.scoresService.getTargetsBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

      let originalTextSyllables = [];
      originalTextSyllables = await this.scoresService.getSubsessionOriginalTextSyllables(CreateLearnerProfileDto.user_id,CreateLearnerProfileDto.sub_session_id);
      targets = targets.filter((targetsEle) => { return originalTextSyllables.includes(targetsEle.character) });
      const totalTargets = targets.length;

      const fluency = await this.scoresService.getFluencyBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  @ApiBody({
    description: 'Request body for storing data to the learner profile',
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'ગોલુને ફરવુ ગમે છે.' },
        audio: { type: 'string', example: 'Add gujarati Wav file base64 string here' },
        user_id: { type: 'string', example: '8819167684' },
        session_id: { type: 'string', example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6' },
        language: { type: 'string', example: 'gu' },
        date: { type: 'string', format: 'date-time', example: '2024-05-07T12:24:51.779Z' },
        sub_session_id: { type: 'string', example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe' },
        contentId: { type: 'string', example: 'b70af0e5-0d74-4287-9548-4d491c714b0d' },
        contentType: { type: 'string', example: 'Sentence' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'ગોલુને ફરવુ ગમે' },
        subsessionTargetsCount: { type: 'number', example: 17 },
        subsessionFluency: { type: 'number', example: 1.54 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
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
    summary:
      'Store students learner ai profile, from the ASR output for a given wav file. This API will work for Gujarati',
  })
  @Post('/updateLearnerProfile/gu')
  async updateLearnerProfileGu(
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const vowelSignArr = gu_config.vowel;
      const language = gu_config.language_code;
      let createScoreData;

      let asrOutDenoised;
      let asrOutBeforeDenoised;

      let nonDenoisedresponseText = "";
      let DenoisedresponseText = "";

      let similarityNonDenoisedText = 0;
      let similarityDenoisedText = 0;

      let constructTokenArr = [];
      let correctTokens = [];
      let missingTokens = [];

      let reptitionCount = 0;

      let confidence_scoresArr = [];
      let missing_token_scoresArr = [];
      let anomaly_scoreArr = [];

      var originalText = CreateLearnerProfileDto.original_text

      if (originalText.endsWith('.')) {
        originalText = originalText.slice(0, -1);
      }

      let originalTokenArr = await this.scoresService.getSyllablesFromString(originalText, vowelSignArr, language);
      let responseText = '';
      let constructText = '';

      let pause_count = 0;

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
          let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language, CreateLearnerProfileDto['contentType']);

          asrOutDenoised = audioOutput.asrOutDenoisedOutput?.output || "";
          asrOutBeforeDenoised = audioOutput.asrOutBeforeDenoised?.output || "";
          pause_count = audioOutput.pause_count || 0;

          similarityDenoisedText = await this.scoresService.getTextSimilarity(originalText, asrOutDenoised[0]?.source || "");
          similarityNonDenoisedText = await this.scoresService.getTextSimilarity(originalText, asrOutBeforeDenoised[0]?.source || "");

          if (similarityDenoisedText <= similarityNonDenoisedText) {
            CreateLearnerProfileDto['output'] = asrOutBeforeDenoised;
            DenoisedresponseText = asrOutDenoised[0]?.source;
            nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
          } else {
            CreateLearnerProfileDto['output'] = asrOutDenoised;
            DenoisedresponseText = asrOutDenoised[0]?.source;
            nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
          }

          if (CreateLearnerProfileDto.output[0].source === '') {
            return response.status(HttpStatus.BAD_REQUEST).send({
              status: 'error',
              message:
                'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
            });
          }
        }

        responseText = CreateLearnerProfileDto.output[0].source;

        // Get All hexcode for this selected language
        const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(language);

        // Constructed Logic starts from here
        let constructedTextRepCountData = await this.scoresService.getConstructedText(originalText, responseText);
        constructText = constructedTextRepCountData.constructText;
        
        reptitionCount = constructedTextRepCountData.reptitionCount;
        constructTokenArr = await this.scoresService.getSyllablesFromString(constructText, vowelSignArr, language);
        

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

        let identifyTokens = await this.scoresService.identifyTokens(CreateLearnerProfileDto.output[0].nBestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

        confidence_scoresArr = identifyTokens.confidence_scoresArr;
        missing_token_scoresArr = identifyTokens.missing_token_scoresArr;
        anomaly_scoreArr = identifyTokens.anomaly_scoreArr;

        // Send a call to text eval serivce
        const textEvalMatrices = await this.scoresService.getTextMetrics(originalText, constructText, language,CreateLearnerProfileDto.audio.toString(('base64')))
        if (process.env.denoiserEnabled === "true") {
          let improved = false;

          let similarityScoreNonDenoisedResText = similarityNonDenoisedText;
          let similarityScoreDenoisedResText = similarityDenoisedText;

          if (similarityScoreDenoisedResText > similarityScoreNonDenoisedResText) {
            improved = true;
          }

          let createDenoiserOutputLog = {
            user_id: CreateLearnerProfileDto.user_id,
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "",
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || "",
            language: language,
            original_text: originalText,
            response_text: nonDenoisedresponseText,
            denoised_response_text: DenoisedresponseText,
            improved: improved,
            comment: ""
          }

          await this.scoresService.addDenoisedOutputLog(createDenoiserOutputLog);
        }

        // calculate fluencyScore
        let fluencyScore = await this.scoresService.getCalculatedFluency(textEvalMatrices, reptitionCount, originalText, responseText, pause_count);

        let createdAt = new Date().toISOString().replace('Z', '+00:00')

        createScoreData = {
          user_id: CreateLearnerProfileDto.user_id, // userid sent by client
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
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false,
          },
        };

        // For retry attempt detection
        const retryAttempt = await this.scoresService.getRetryStatus(
          CreateLearnerProfileDto.user_id,
          CreateLearnerProfileDto.contentId,
        );

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);
      }

      // Cal the subsessionWise and content_id wise target.
      let targets = await this.scoresService.getTargetsBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

      let originalTextSyllables = [];
      originalTextSyllables = await this.scoresService.getSubsessionOriginalTextSyllables(CreateLearnerProfileDto.user_id,CreateLearnerProfileDto.sub_session_id);
      targets = targets.filter((targetsEle) => { return originalTextSyllables.includes(targetsEle.character) });
      const totalTargets = targets.length;

      const fluency = await this.scoresService.getFluencyBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        originalText: originalText,
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2))
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  @ApiBody({
    description: 'Request body for storing data to the learner profile',
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'ବିଲେଇ' },
        audio: { type: 'string', example: 'Add odiya Wav file base64 string here' },
        user_id: { type: 'string', example: '8819167684' },
        session_id: { type: 'string', example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6' },
        language: { type: 'string', example: 'or' },
        date: { type: 'string', format: 'date-time', example: '2024-05-07T12:24:51.779Z' },
        sub_session_id: { type: 'string', example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe' },
        contentId: { type: 'string', example: 'b70af0e5-0d74-4287-9548-4d491c714b0d' },
        contentType: { type: 'string', example: 'word' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'ବିଲେଇ' },
        subsessionTargetsCount: { type: 'number', example: 17 },
        subsessionFluency: { type: 'number', example: 1.54 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
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
    summary:
      'Store students learner ai profile, from the ASR output for a given wav file. This API will work for odiya',
  })
  @Post('/updateLearnerProfile/or')
  async updateLearnerProfileOr(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = ((request as any).user.virtual_id).toString();
      const vowelSignArr = or_config.vowel;
      const language = or_config.language_code;
      
      let createScoreData;

      let asrOutDenoised;
      let asrOutBeforeDenoised;

      let nonDenoisedresponseText = "";
      let DenoisedresponseText = "";

      let similarityNonDenoisedText = 0;
      let similarityDenoisedText = 0;

      let constructTokenArr = [];
      let correctTokens = [];
      let missingTokens = [];

      let reptitionCount = 0;

      let confidence_scoresArr = [];
      let missing_token_scoresArr = [];
      let anomaly_scoreArr = [];
  
      const originalText = CreateLearnerProfileDto.original_text;
      
      let originalTokenArr = await this.scoresService.getSyllablesFromString(originalText, vowelSignArr, language);
      let responseText = '';
      let constructText = '';

      let pause_count = 0;

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
          let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language, CreateLearnerProfileDto['contentType']);

          asrOutDenoised = audioOutput.asrOutDenoisedOutput?.output || "";
          asrOutBeforeDenoised = audioOutput.asrOutBeforeDenoised?.output || "";
          pause_count = audioOutput.pause_count || 0;

          similarityDenoisedText = await this.scoresService.getTextSimilarity(originalText, asrOutDenoised[0]?.source || "");
          similarityNonDenoisedText = await this.scoresService.getTextSimilarity(originalText, asrOutBeforeDenoised[0]?.source || "");

          if (similarityDenoisedText <= similarityNonDenoisedText) {
            CreateLearnerProfileDto['output'] = asrOutBeforeDenoised;
            DenoisedresponseText = asrOutDenoised[0]?.source;
            nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
          } else {
            CreateLearnerProfileDto['output'] = asrOutDenoised;
            DenoisedresponseText = asrOutDenoised[0]?.source;
            nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
          }

          if (CreateLearnerProfileDto.output[0].source === '') {
            return response.status(HttpStatus.BAD_REQUEST).send({
              status: 'error',
              message:
                'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
            });
          }
        }

        responseText = CreateLearnerProfileDto.output[0].source;

        // Get All hexcode for this selected language
        const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(language);
        
        // Constructed Logic starts from here
        let constructedTextRepCountData = await this.scoresService.getConstructedText(originalText, responseText);
        constructText = constructedTextRepCountData.constructText;
        reptitionCount = constructedTextRepCountData.reptitionCount;
        constructTokenArr = await this.scoresService.getSyllablesFromString(constructText, vowelSignArr, language);

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

        let identifyTokens = await this.scoresService.identifyTokens(CreateLearnerProfileDto.output[0].nBestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

        confidence_scoresArr = identifyTokens.confidence_scoresArr;
        missing_token_scoresArr = identifyTokens.missing_token_scoresArr;
        anomaly_scoreArr = identifyTokens.anomaly_scoreArr;

        // Send a call to text eval serivce
        const textEvalMatrices = await this.scoresService.getTextMetrics(originalText, constructText, language,CreateLearnerProfileDto.audio.toString(('base64')))
        if (process.env.denoiserEnabled === "true") {
          let improved = false;

          let similarityScoreNonDenoisedResText = similarityNonDenoisedText;
          let similarityScoreDenoisedResText = similarityDenoisedText;

          if (similarityScoreDenoisedResText > similarityScoreNonDenoisedResText) {
            improved = true;
          }

          let createDenoiserOutputLog = {
            user_id: user_id,
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "",
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || "",
            language: language,
            original_text: originalText,
            response_text: nonDenoisedresponseText,
            denoised_response_text: DenoisedresponseText,
            improved: improved,
            comment: ""
          }

          await this.scoresService.addDenoisedOutputLog(createDenoiserOutputLog);
        }

        // calculate fluencyScore
        let fluencyScore = await this.scoresService.getCalculatedFluency(textEvalMatrices, reptitionCount, originalText, responseText, pause_count);

        let createdAt = new Date().toISOString().replace('Z', '+00:00')

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
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false,
          },
        };

        // For retry attempt detection
        const retryAttempt = await this.scoresService.getRetryStatus(
          user_id,
          CreateLearnerProfileDto.contentId,
        );

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);
      }

      // Cal the subsessionWise and content_id wise target.
      let targets = await this.scoresService.getTargetsBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );
      
      let originalTextSyllables = [];
      originalTextSyllables = await this.scoresService.getSubsessionOriginalTextSyllables( CreateLearnerProfileDto.user_id,CreateLearnerProfileDto.sub_session_id);
    
      targets = targets.filter((targetsEle) => { return originalTextSyllables.includes(targetsEle.character) });
      const totalTargets = targets.length;

      const fluency = await this.scoresService.getFluencyBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        originalText: originalText,
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2))
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }


  @ApiBody({
    description: 'Request body for storing data to the learner profile',
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'आपसे मिलकर अच्छा लगा' },
        audio: { type: 'string', example: 'Add hindi Wav file base64 string here' },
        user_id: { type: 'string', example: '8819167684' },
        session_id: { type: 'string', example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6' },
        language: { type: 'string', example: 'hi' },
        date: { type: 'string', format: 'date-time', example: '2024-05-07T12:24:51.779Z' },
        sub_session_id: { type: 'string', example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe' },
        contentId: { type: 'string', example: 'b70af0e5-0d74-4287-9548-4d491c714b0d' },
        contentType: { type: 'string', example: 'Sentence' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'आपसे मिलकर अच्छा लगा' },
        subsessionTargetsCount: { type: 'number', example: 17 },
        subsessionFluency: { type: 'number', example: 1.54 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
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
    summary:
      'Store students learner ai profile, from the ASR output for a given wav file. This API will work for Hindi',
  })
  @Post('/updateLearnerProfile/hi')
async updateLearnerProfileHi(
  @Req() request: FastifyRequest,
  @Res() response: FastifyReply,
  @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
) {
  try {
    const user_id = ((request as any).user.virtual_id).toString();

    if (
      CreateLearnerProfileDto['output'] === undefined &&
      CreateLearnerProfileDto.audio !== undefined
    ) {
      const audioFile = CreateLearnerProfileDto.audio;
      const decoded = Buffer.isBuffer(audioFile)
        ? audioFile.toString('base64')
        : audioFile; // if it's already a base64 string

      const audioOutput = await this.scoresService.audioFileToAsrOutput(
        decoded,
        'hi',
        CreateLearnerProfileDto['contentType'],
      );
      CreateLearnerProfileDto['output'] = audioOutput.output;
    }

    const vowelSignArr = hi_config.vowel;
    const language = hi_config.language_code;
    const originalText = CreateLearnerProfileDto.original_text;

    let asrOutDenoised, asrOutBeforeDenoised;
    let responseText = '';
    let constructText = '';
    let pause_count = 0;
    let similarityNonDenoisedText = 0;
    let similarityDenoisedText = 0;
    let nonDenoisedresponseText = '';
    let DenoisedresponseText = '';
    let reptitionCount = 0;
    let constructTokenArr = [];
    let correctTokens = [];
    let missingTokens = [];
    let confidence_scoresArr = [];
    let missing_token_scoresArr = [];
    let anomaly_scoreArr = [];

    const originalTokenArr = await this.scoresService.getSyllablesFromString(originalText, vowelSignArr, language);

    if (CreateLearnerProfileDto['contentType'].toLowerCase() !== 'char') {
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

        asrOutDenoised = audioOutput.asrOutDenoisedOutput?.output || '';
        asrOutBeforeDenoised = audioOutput.asrOutBeforeDenoised?.output || '';
        pause_count = audioOutput.pause_count || 0;

        similarityDenoisedText = await this.scoresService.getTextSimilarity(
          originalText,
          asrOutDenoised[0]?.source || '',
        );

        similarityNonDenoisedText = await this.scoresService.getTextSimilarity(
          originalText,
          asrOutBeforeDenoised[0]?.source || '',
        );

        if (similarityDenoisedText <= similarityNonDenoisedText) {
          CreateLearnerProfileDto['output'] = asrOutBeforeDenoised;
          DenoisedresponseText = asrOutDenoised[0]?.source;
          nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
        } else {
          CreateLearnerProfileDto['output'] = asrOutDenoised;
          DenoisedresponseText = asrOutDenoised[0]?.source;
          nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
        }

        if (CreateLearnerProfileDto.output[0].source === '') {
          return response.status(HttpStatus.BAD_REQUEST).send({
            status: 'error',
            message: 'Audio to Text functionality responded with an empty response. Please check the audio file or speak louder.',
          });
        }
      }

      responseText = CreateLearnerProfileDto.output[0].source;

      const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(language);
      const constructedTextRepCountData = await this.scoresService.getConstructedText(originalText, responseText);
      constructText = constructedTextRepCountData.constructText;
      reptitionCount = constructedTextRepCountData.reptitionCount;
      constructTokenArr = await this.scoresService.getSyllablesFromString(constructText, vowelSignArr, language);

      for (const originalToken of originalTokenArr) {
        if (constructTokenArr.includes(originalToken)) {
          correctTokens.push(originalToken);
        } else {
          missingTokens.push(originalToken);
        }
      }

      missingTokens = Array.from(new Set(missingTokens));

      const identifyTokens = await this.scoresService.identifyTokens(
        CreateLearnerProfileDto.output[0].nBestTokens,
        correctTokens,
        missingTokens,
        tokenHexcodeDataArr,
        vowelSignArr,
      );

      confidence_scoresArr = identifyTokens.confidence_scoresArr;
      confidence_scoresArr = confidence_scoresArr.map(item => ({
        ...item,
        confidence_score: item.confidence_score < 0.7 ? 0.777 : item.confidence_score,
        identification_status: 1
      }));
      missing_token_scoresArr = identifyTokens.missing_token_scoresArr;
      anomaly_scoreArr = identifyTokens.anomaly_scoreArr;

      const textEvalMatrices = await this.scoresService.getTextMetrics(
        originalText,
        constructText,
        language,
        Buffer.isBuffer(CreateLearnerProfileDto.audio)
          ? CreateLearnerProfileDto.audio.toString('base64')
          : CreateLearnerProfileDto.audio,
      );

      if (process.env.denoiserEnabled === 'true') {
        const improved = similarityDenoisedText > similarityNonDenoisedText;

        const createDenoiserOutputLog = {
          user_id: CreateLearnerProfileDto.user_id,
          session_id: CreateLearnerProfileDto.session_id,
          sub_session_id: CreateLearnerProfileDto.sub_session_id || '',
          contentType: CreateLearnerProfileDto.contentType,
          contentId: CreateLearnerProfileDto.contentId || '',
          language,
          original_text: originalText,
          response_text: nonDenoisedresponseText,
          denoised_response_text: DenoisedresponseText,
          improved,
          comment: '',
        };

        await this.scoresService.addDenoisedOutputLog(createDenoiserOutputLog);
      }

      const fluencyScore = await this.scoresService.getCalculatedFluency(
        textEvalMatrices,
        reptitionCount,
        originalText,
        responseText,
        pause_count,
      );

      const createdAt = new Date().toISOString().replace('Z', '+00:00');

      const createScoreData = {
        user_id: CreateLearnerProfileDto.user_id,
        session: {
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
          silence_Pause: {
            total_duration: 0,
            count: pause_count,
          },
          reptitionsCount: reptitionCount,
          asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
          isRetry: false,
        },
      };

      await this.scoresService.create(createScoreData);
    }

    const retryAttempt = await this.scoresService.getRetryStatus(
      user_id,
      CreateLearnerProfileDto.contentId,
    );

      // Cal the subsessionWise and content_id wise target.
      let targets = await this.scoresService.getTargetsBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

      let originalTextSyllables = [];
      originalTextSyllables = await this.scoresService.getSubsessionOriginalTextSyllables(CreateLearnerProfileDto.user_id,CreateLearnerProfileDto.sub_session_id);
      targets = targets.filter((targetsEle) => { return originalTextSyllables.includes(targetsEle.character) });
      const totalTargets = targets.length;

      const fluency = await this.scoresService.getFluencyBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

    const fluency = await this.scoresService.getFluencyBysubSession(
      CreateLearnerProfileDto.user_id,
      CreateLearnerProfileDto.sub_session_id,
      CreateLearnerProfileDto.language,
    );

    return response.status(HttpStatus.CREATED).send({
      status: 'success',
      msg: 'Successfully stored data to learner profile',
      originalText,
      responseText,
      subsessionTargetsCount: targets.length,
      subsessionFluency: parseFloat(fluency.toFixed(2)),
    });
  } catch (err) {
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      status: 'error',
      message: 'Server error - ' + err,
    });
  }
}

 

  @ApiBody({
    description: 'Request body for storing data to the learner profile',
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'ಆಕಾಶನ ಮನೆಯು ಅಂಗಡಿಯ ಹತ್ತಿರ ಇದೆ' },
        audio: { type: 'string', example: 'Add kannada Wav file base64 string here' },
        user_id: { type: 'string', example: '8819167684' },
        session_id: { type: 'string', example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6' },
        language: { type: 'string', example: 'hi' },
        date: { type: 'string', format: 'date-time', example: '2024-05-07T12:24:51.779Z' },
        sub_session_id: { type: 'string', example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe' },
        contentId: { type: 'string', example: 'b70af0e5-0d74-4287-9548-4d491c714b0d' },
        contentType: { type: 'string', example: 'Sentence' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'ಆಕಾಶನ ಮನೆಯು ಅಂಗಡಿಯ ಹತ್ತಿರ ಇದೆ' },
        subsessionTargetsCount: { type: 'number', example: 17 },
        subsessionFluency: { type: 'number', example: 1.54 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
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
    summary:
      'Store students learner ai profile, from the ASR output for a given wav file. This API will work for Kannada',
  })
  @Post('/updateLearnerProfile/kn')
  async updateLearnerProfileKn(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = ((request as any).user.virtual_id).toString();
      const confidence_scoresArr = [];
      const anomaly_scoreArr = [];
      const missing_token_scoresArr = [];
      const correctTokens = [];
      let missingTokens = [];
      let vowelSignArr = [];
      const originalTokenArr = [];
      const responseTokenArr = [];
      const constructTokenArr = [];
      let asrOutDenoised;
      let nonDenoisedresponseText;
      let DenoisedresponseText;
      let asrOutBeforeDenoised;

      const mode = CreateLearnerProfileDto.mode;

      const language = kn_config.language_code;

      const originalText = CreateLearnerProfileDto.original_text;
      const originalTextTokensArr = originalText.split('');

      const kannadaVowelSignArr = kn_config.vowel
      vowelSignArr = kannadaVowelSignArr;

      let responseText = '';

      let prevEle = '';
      let isPrevVowel = false;
      let createScoreData: any;

      let pause_count = 0;
      let audioFile;
      let avg_pause = 0;

      let pitch_classification = "";
      let pitch_mean = 0;
      let pitch_std = 0;
      let intensity_classification = "";
      let intensity_mean = 0;
      let intensity_std = 0;
      let expression_classification = "";
      let smoothness_classification = "";
      let tokenArrandAnamolyArrdefine = false;
      let tokenArr = [];
      let anamolyTokenArr = [];

      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== 'char') {
      
      if(mode == 'online' || mode == undefined){
        if (
          CreateLearnerProfileDto['output'] === undefined &&
          CreateLearnerProfileDto.audio !== undefined
        ) {
          audioFile = CreateLearnerProfileDto.audio;
          const decoded = audioFile.toString('base64');
          const audioOutput = await this.scoresService.audioFileToAsrOutput(
            decoded,
            'kn',
            CreateLearnerProfileDto['contentType']
          );
          asrOutDenoised = audioOutput.asrOutDenoisedOutput?.output || "";
          asrOutBeforeDenoised = audioOutput.asrOutBeforeDenoised?.output || "";
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

          if (similarity(originalText, asrOutDenoised[0]?.source || "") <= similarity(originalText, asrOutBeforeDenoised[0]?.source || "")) {
            CreateLearnerProfileDto['output'] = asrOutBeforeDenoised;
            DenoisedresponseText = asrOutDenoised[0]?.source;
            nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
          } else {
            CreateLearnerProfileDto['output'] = asrOutDenoised;
            DenoisedresponseText = asrOutDenoised[0]?.source;
            nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
          }

          if (CreateLearnerProfileDto.output[0].source === '') {
            return response.status(HttpStatus.BAD_REQUEST).send({
              status: 'error',
              message:
                'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
            });
          }
        }
        let constructTokens = [];

        if (CreateLearnerProfileDto.contentType.toLowerCase() == 'word'){ // If it is word check for Token combinations and agreeable substitutes for word improvements
          let originalSimilarity = await this.scoresService.getTextSimilarity(nonDenoisedresponseText, originalText)
          constructTokens = await this.scoresService.processTokens(CreateLearnerProfileDto.output[0].nBestTokens)  
          const wordsWithValues = await this.scoresService.generateWords(constructTokens); // Form all possible words from ASR tokens
          const replacements = kn_config.replacements;
          const firstChar = originalText[0]
          if (replacements.hasOwnProperty(firstChar)) { // If it is agreeable , construct the possible orignal words and compare all construted words for better possible response
            let agreeableResults = replacements[firstChar] + originalText.slice(1);
            let agreeableHighestSimilarity = await this.scoresService.findAllSimilarities(wordsWithValues, [originalText, agreeableResults]);
            if (originalSimilarity >= agreeableHighestSimilarity[3]) {
              responseText = nonDenoisedresponseText;
              tokenArrandAnamolyArrdefine = true;
            }

            else { //if the constructed has highesr similarity we'll be pushing the usedArr into tokenArr and unusedArr into anamolyTokenArr
              responseText = agreeableHighestSimilarity[0];
              tokenArr = agreeableHighestSimilarity[1];
              anamolyTokenArr = agreeableHighestSimilarity[2];
            }

          }
          else { // If is not agreeable, compare the costructed words with original and get hisghest
            let constructedHighestSimilarity = await this.scoresService.findAllSimilarities(wordsWithValues, [originalText]);
            if (originalSimilarity >= constructedHighestSimilarity[3]) {
              responseText = nonDenoisedresponseText;
              tokenArrandAnamolyArrdefine = true;
            }
            else { //if the constructed has highesr similarity we'll be pushing the usedArr into tokenArr and unusedArr into anamolyTokenArr
              responseText = constructedHighestSimilarity[0];
              tokenArr = constructedHighestSimilarity[1];
              anamolyTokenArr = constructedHighestSimilarity[2];
            }
          }
          
        }
        else  {  // If it is not a word use reeponse given by ASR
          responseText = CreateLearnerProfileDto.output[0].source;
        }
      }else{
        responseText = CreateLearnerProfileDto.response_text;
        pause_count = CreateLearnerProfileDto.pause_count;
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
        if (CreateLearnerProfileDto.contentType.toLowerCase() != 'word' || tokenArrandAnamolyArrdefine) {
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
                let confidenceScore = value.charvalue>0.7 ? value.charvalue : 0.777
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


        const url = process.env.ALL_TEXT_EVAL_API + "/getTextMatrices";

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
                throw 'Error from text Eval service' + error;
              }),
            ),
        );
        let tempo_classification = textEvalMatrices.tempo_classification;
        let pause_count_textEval = textEvalMatrices.pause_count;
        let words_per_minute = textEvalMatrices.words_per_minute;
        let rate_classification = textEvalMatrices.rate_classification;
        if (mode !== 'offline') {

        if (process.env.denoiserEnabled === "true") {
          let improved = false;

          let similarityScoreNonDenoisedResText = similarity(originalText, nonDenoisedresponseText);
          let similarityScoreDenoisedResText = similarity(originalText, DenoisedresponseText);

          if (similarityScoreDenoisedResText > similarityScoreNonDenoisedResText) {
            improved = true;
          }

          let createDenoiserOutputLog = {
            user_id: user_id,
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "",
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || "",
            language: language,
            original_text: originalText,
            response_text: nonDenoisedresponseText,
            denoised_response_text: DenoisedresponseText,
            improved: improved,
            comment: ""
          }

          await this.scoresService.addDenoisedOutputLog(createDenoiserOutputLog);
        }

        }

        const wer = textEvalMatrices.wer;
        const cercal = textEvalMatrices.cer * 2;
        const charCount = Math.abs(
          CreateLearnerProfileDto.original_text.length -
          responseText.length,
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

        const createdAt = new Date().toISOString().replace('Z', '+00:00');
        let accuracy_classification = this.scoresService.getAccuracyClassification(CreateLearnerProfileDto.contentType, fluencyScore);

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
                pitch_std: pitch_std
              },
              intensity: {
                intensity_classification: intensity_classification,
                intensity_mean: intensity_mean,
                intensity_std: intensity_std
              },
              tempo: {
                tempo_classification: tempo_classification,
                words_per_minute: words_per_minute,
                pause_count: pause_count_textEval,
               },
              expression_classification: expression_classification,
              smoothness: {
                smoothness_classification: smoothness_classification,
                pause_count:pause_count,
                avg_pause: avg_pause
              },
              rate: {
                rate_classification: rate_classification,
                words_per_minute: words_per_minute,
              },
              accuracy: {
                accuracy_classification: accuracy_classification,
                fluencyScore: fluencyScore.toFixed(3),
              }
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false,
            mode:mode
          },
        };

        // For retry attempt detection
        const retryAttempt = await this.scoresService.getRetryStatus(
          user_id,
          CreateLearnerProfileDto.contentId,
        );

        // Store Array to DB
        const data = this.scoresService.create(createScoreData);

        function getTokenHexcode(token: string) {
          const result = tokenHexcodeDataArr.find(
            (item) => item.token.trim() === token.trim(),
          );
          return result?.hexcode || '';
        }
      }

      // Cal the subsessionWise and content_id wise target.
      let targets = await this.scoresService.getTargetsBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

      let originalTextSyllables = [];
      originalTextSyllables = await this.scoresService.getSubsessionOriginalTextSyllables(CreateLearnerProfileDto.user_id,CreateLearnerProfileDto.sub_session_id);
      targets = targets.filter((targetsEle) => { return originalTextSyllables.includes(targetsEle.character) });

      const totalTargets = targets.length;

      const fluency = await this.scoresService.getFluencyBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );
      
      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  @ApiBody({
    description: 'Request body for storing data to the learner profile',
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'assisted language learning' },
        audio: { type: 'string', example: 'Add english Wav file base64 string here' },
        user_id: { type: 'string', example: '8819167684' },
        session_id: { type: 'string', example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6' },
        language: { type: 'string', example: 'en' },
        date: { type: 'string', format: 'date-time', example: '2024-05-07T12:24:51.779Z' },
        sub_session_id: { type: 'string', example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe' },
        contentId: { type: 'string', example: 'b70af0e5-0d74-4287-9548-4d491c714b0d' },
        contentType: { type: 'string', example: 'Sentence' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'assisted language learning' },
        subsessionTargetsCount: { type: 'number', example: 17 },
        subsessionFluency: { type: 'number', example: 1.54 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
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
    summary:
      'Store students learner ai profile, from the ASR output for a given wav file. This API will work for English',
  })
  @Post('/updateLearnerProfile/en')
  async updateLearnerProfileEn(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto,
  ) {
    try {
      const user_id = ((request as any).user.virtual_id).toString();
      const originalText = await this.scoresService.processText(CreateLearnerProfileDto.original_text);
      const mode = CreateLearnerProfileDto.mode;

      let createScoreData;
      let language = en_config.language_code;
      let reptitionCount = 0;
      let responseText = "";
      let confidence_scoresArr = [];
      let anomaly_scoreArr = [];
      let missing_token_scoresArr = [];

      let asrOutDenoised;
      let asrOutBeforeDenoised;

      let nonDenoisedresponseText = "";
      let DenoisedresponseText = "";

      let similarityNonDenoisedText = 0;
      let similarityDenoisedText = 0;

      let pause_count = 0;
      let avg_pause = 0;

      let pitch_classification = "";
      let pitch_mean = 0;
      let pitch_std = 0;
      let intensity_classification = "";
      let intensity_mean = 0;
      let intensity_std = 0;
      let expression_classification = "";
      let smoothness_classification = "";
      
      let correct_choice_score = 0;
      let correctness_score = 0;
      let is_correct_choice = CreateLearnerProfileDto.is_correct_choice;
      let comprehension;


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
            let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language, CreateLearnerProfileDto['contentType']);

            asrOutDenoised = audioOutput.asrOutDenoisedOutput?.output || "";
            asrOutBeforeDenoised = audioOutput.asrOutBeforeDenoised?.output || "";
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

            similarityDenoisedText = await this.scoresService.getTextSimilarity(originalText, asrOutDenoised[0]?.source || "");
            similarityNonDenoisedText = await this.scoresService.getTextSimilarity(originalText, asrOutBeforeDenoised[0]?.source || "");

            if (similarityDenoisedText <= similarityNonDenoisedText) {
              CreateLearnerProfileDto['output'] = asrOutBeforeDenoised;
              DenoisedresponseText = await this.scoresService.processText(asrOutDenoised[0]?.source || "");
              nonDenoisedresponseText = await this.scoresService.processText(asrOutBeforeDenoised[0]?.source || "");
            } else {
              CreateLearnerProfileDto['output'] = asrOutDenoised;
              DenoisedresponseText = await this.scoresService.processText(asrOutDenoised[0]?.source || "");
              nonDenoisedresponseText = await this.scoresService.processText(asrOutBeforeDenoised[0]?.source || "");
            }

            if (CreateLearnerProfileDto.output[0].source === '') {
              return response.status(HttpStatus.BAD_REQUEST).send({
                status: 'error',
                message:
                  'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
              });
            }
          }

          responseText = await this.scoresService.processText(CreateLearnerProfileDto.output[0].source);
        }
        else {
          responseText = await this.scoresService.processText(CreateLearnerProfileDto.response_text);
          pause_count = CreateLearnerProfileDto.pause_count;
        }
        // Get All hexcode for this selected language
        const tokenHexcodeDataArr = await this.scoresService.gethexcodeMapping(language);

        const textEvalMatrices = await this.scoresService.getTextMetrics(originalText, responseText, language,CreateLearnerProfileDto.audio.toString(('base64')))
        let tempo_classification = textEvalMatrices.tempo_classification;
        let pause_count_textEval = textEvalMatrices.pause_count;
        let words_per_minute = textEvalMatrices.words_per_minute;
        let rate_classification = textEvalMatrices.rate_classification;
 

        responseText = await this.scoresService.processText(CreateLearnerProfileDto.output[0].source);
      
        if(CreateLearnerProfileDto.ans_key && CreateLearnerProfileDto.ans_key.length >0 &&  DenoisedresponseText.length>0) {
          comprehension = await this.scoresService.getComprehensionFromLLM(CreateLearnerProfileDto.question_text,DenoisedresponseText,CreateLearnerProfileDto.ans_key[0]);
          
          let createLlmOutputLog = {
            user_id: CreateLearnerProfileDto.user_id,
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "",
            questionText: CreateLearnerProfileDto.question_text || "",
            teacherText: originalText,
            studentText: responseText,
            ansKey: CreateLearnerProfileDto.ans_key,
            marks: comprehension.marks,
            semantics: comprehension.semantics,
            grammar: comprehension.grammar,
            accuracy: comprehension.accuracy,
            overall: comprehension.overall,
           
          }
          await this.scoresService.addLlmOutputLog(createLlmOutputLog);
        }

        if (CreateLearnerProfileDto['contentType'].toLowerCase() === 'word' && CreateLearnerProfileDto.hallucination_alternative && 
        Array.isArray(CreateLearnerProfileDto.hallucination_alternative) && 
        CreateLearnerProfileDto.hallucination_alternative.length > 0){

          function checkResponseTextAnomaly(responseText: string): boolean {
            const phrasesToCheck = ["thank you", "and", "yes"];
            return phrasesToCheck.some(phrase => responseText.includes(phrase));
          }

          const checkHallucinationAlternatives = async (responseText: string, hallucinationAlternatives: any): Promise<boolean> => {
            const similarityThreshold = 0.5; // 50% similarity
            for (const alternative of hallucinationAlternatives) {
              const similarityScore = await this.scoresService.getTextSimilarity(responseText, alternative);
              if (similarityScore >= similarityThreshold) {
                return true;
              }
            }
            return false;
          };

          const checkConstructTextSimilarity = async (constructText: string): Promise<boolean> => {
            const similarityThreshold = 0.5;
            const similarityScore = await this.scoresService.getTextSimilarity(constructText, originalText);
            return similarityScore >= similarityThreshold;
          }

          if(await checkResponseTextAnomaly(responseText) || await checkHallucinationAlternatives(responseText, CreateLearnerProfileDto.hallucination_alternative) || await checkConstructTextSimilarity(responseText)){
            responseText = originalText;
          }
        }

        for (const confidence_char of textEvalMatrices.confidence_char_list) {
          const hexcode = await this.scoresService.getTokenHexcode(tokenHexcodeDataArr, confidence_char);

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
          const hexcode = await this.scoresService.getTokenHexcode(tokenHexcodeDataArr, missing_char);

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

        if (process.env.denoiserEnabled === "true") {
          let improved = false;

          let similarityScoreNonDenoisedResText = similarityNonDenoisedText;
          let similarityScoreDenoisedResText = similarityDenoisedText;

          if (similarityScoreDenoisedResText > similarityScoreNonDenoisedResText) {
            improved = true;
          }

          let createDenoiserOutputLog = {
            user_id: user_id,
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "",
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || "",
            language: language,
            original_text: originalText,
            response_text: nonDenoisedresponseText,
            denoised_response_text: DenoisedresponseText,
            improved: improved,
            comment: ""
          }
        }

        if (mode !== 'offline') {
          if (process.env.denoiserEnabled === "true") {
            let improved = false;
            let similarityScoreNonDenoisedResText = similarityNonDenoisedText;
            let similarityScoreDenoisedResText = similarityDenoisedText;

            if (similarityScoreDenoisedResText > similarityScoreNonDenoisedResText) {
              improved = true;
            }

            let createDenoiserOutputLog = {
              user_id: CreateLearnerProfileDto.user_id,
              session_id: CreateLearnerProfileDto.session_id,
              sub_session_id: CreateLearnerProfileDto.sub_session_id || "",
              contentType: CreateLearnerProfileDto.contentType,
              contentId: CreateLearnerProfileDto.contentId || "",
              language: language,
              original_text: originalText,
              response_text: nonDenoisedresponseText,
              denoised_response_text: DenoisedresponseText,
              improved: improved,
              comment: ""
            }

            await this.scoresService.addDenoisedOutputLog(createDenoiserOutputLog);
          }
        }

        // Constructed Logic starts from here
        let constructedTextRepCountData = await this.scoresService.getConstructedText(originalText, responseText);
        let repetitions = constructedTextRepCountData.reptitionCount;
        // End Constructed Text Logic

        let fluencyScore = await this.scoresService.getCalculatedFluency(textEvalMatrices, repetitions, originalText, responseText, pause_count);
        let createdAt = new Date().toISOString().replace('Z', '+00:00')
        let accuracy_classification = this.scoresService.getAccuracyClassification(CreateLearnerProfileDto.contentType, fluencyScore);

        // Add check for the correct choice

        if (is_correct_choice !== undefined && is_correct_choice !== null) {
         
          // calculation for the correct choice final score 
          let similarityDenoised = similarityDenoisedText * 100
          let key_word = CreateLearnerProfileDto.correctness['50%']
          const allWordsPresent = key_word.every(word => responseText.includes(word.toLowerCase()));

          if (is_correct_choice && similarityDenoised >= 70) {
            correctness_score = 100
          } else if (is_correct_choice && allWordsPresent) {
            correctness_score = 60
          } else if (is_correct_choice) {
            correctness_score = 20
          }
        }

        createScoreData = {
          user_id: user_id, // userid sent by client
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || '', // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || '', // contentId of original text content shown to user to speak
            comprehension:comprehension, // Response from LLM for mechanics
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
                pitch_std: pitch_std
              },
              intensity: {
                intensity_classification: intensity_classification,
                intensity_mean: intensity_mean,
                intensity_std: intensity_std
              },
              tempo: {
                tempo_classification: tempo_classification,
                words_per_minute: words_per_minute,
                pause_count: pause_count_textEval,
               },
              expression_classification: expression_classification,
              smoothness: {
                smoothness_classification: smoothness_classification,
                pause_count:pause_count,
                avg_pause: avg_pause
              },
              rate: {
                rate_classification: rate_classification,
                words_per_minute: words_per_minute,
              },
              accuracy: {
                accuracy_classification: accuracy_classification,
                fluencyScore: fluencyScore.toFixed(3),
              }
            },
            reptitionsCount: reptitionCount,
            asrOutput: CreateLearnerProfileDto.output ? JSON.stringify(CreateLearnerProfileDto.output) : "No Asr call",
            mechanics_id : CreateLearnerProfileDto.mechanics_id || "",
            isRetry: false,
            mode:mode
          },
        };

        // For retry attempt detection
        const retryAttempt = await this.scoresService.getRetryStatus(
          user_id,
          CreateLearnerProfileDto.contentId,
        );

        // Store Array to DB
        const data = await this.scoresService.create(createScoreData);
      }

      // Cal the subsessionWise and content_id wise target.
      const targets = await this.scoresService.getTargetsBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language
      );
      
      const totalTargets = targets.length;

      const fluency = await this.scoresService.getFluencyBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
        createScoreData: createScoreData
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  @ApiBody({
    description: 'Request body for storing data to the learner profile',
    schema: {
      type: 'object',
      properties: {
        original_text: { type: 'string', example: 'షాపు దగ్గరే ఆకాశ ఇల్లు' },
        audio: { type: 'string', example: 'Add telgu Wav file base64 string here' },
        user_id: { type: 'string', example: '8819167684' },
        session_id: { type: 'string', example: 'IYmeBW1g3GpJb1AE0fOpHCPhKxJG4zq6' },
        language: { type: 'string', example: 'en' },
        date: { type: 'string', format: 'date-time', example: '2024-05-07T12:24:51.779Z' },
        sub_session_id: { type: 'string', example: '4TsVQ28LWibb8Yi2uJg4DtLK3svIbIHe' },
        contentId: { type: 'string', example: 'b70af0e5-0d74-4287-9548-4d491c714b0d' },
        contentType: { type: 'string', example: 'Sentence' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Success message when data is stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        msg: { type: 'string', example: 'Successfully stored data to learner profile' },
        responseText: { type: 'string', example: 'షాపు దగ్గరే ఆకాశ ఇల్లు' },
        subsessionTargetsCount: { type: 'number', example: 17 },
        subsessionFluency: { type: 'number', example: 1.54 },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error while data is being stored to the learner profile',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        msg: { type: 'string', example: 'Server error - error message' },
      },
    },
  })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiOperation({ summary: 'Store students learner ai profile, from the ASR output for a given wav file. This API will work for telgu' })
  @Post('/updateLearnerProfile/te')
  async updateLearnerProfileTe(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply, 
    @Body() CreateLearnerProfileDto: CreateLearnerProfileDto) {
    try {
      const user_id = ((request as any).user.virtual_id).toString();
      let originalText = CreateLearnerProfileDto.original_text;
      let createScoreData;

      let correctTokens = [];
      let missingTokens = [];

      let vowelSignArr = [];
      let asrOutDenoised;
      let nonDenoisedresponseText;
      let DenoisedresponseText;
      let asrOutBeforeDenoised;


      let telguVowelSignArr = [
        "ా",
        "ి",
        "ీ",
        "ు",
        "ూ",
        "ృ",
        "ౄ",
        "ె",
        "ే",
        "ై",
        "ొ",
        "ో",
        "ౌ",
        "ం",
        "ః"
      ];

      let language = "te";
      vowelSignArr = telguVowelSignArr;

      let responseText = '';
      let prevEle = '';
      let isPrevVowel = false;


      let originalTokenArr = [];
      let responseTokenArr = [];
      let constructTokenArr = [];

      let pause_count = 0;

      // This code block used to create tamil compound consonents from text strings
      for (let originalTextELE of originalText.split("")) {
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
      if (CreateLearnerProfileDto['contentType'].toLowerCase() !== "char") {
        let audioFile;

        if (CreateLearnerProfileDto['output'] === undefined && CreateLearnerProfileDto.audio !== undefined) {
          audioFile = CreateLearnerProfileDto.audio;
          const decoded = audioFile.toString('base64');

          // Send Audio file to ASR to process and provide vector with char and score
          let audioOutput = await this.scoresService.audioFileToAsrOutput(decoded, CreateLearnerProfileDto.language, CreateLearnerProfileDto['contentType']);
          asrOutDenoised = audioOutput.asrOutDenoisedOutput?.output || "";
          asrOutBeforeDenoised = audioOutput.asrOutBeforeDenoised?.output || "";
          pause_count = audioOutput.pause_count || 0;

          if (await this.scoresService.getTextSimilarity(originalText, asrOutDenoised[0]?.source || "") <= await this.scoresService.getTextSimilarity(originalText, asrOutBeforeDenoised[0]?.source || "")) {
            CreateLearnerProfileDto['output'] = asrOutBeforeDenoised;
            DenoisedresponseText = asrOutDenoised[0]?.source;
            nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
          } else {
            CreateLearnerProfileDto['output'] = asrOutDenoised;
            DenoisedresponseText = asrOutDenoised[0]?.source;
            nonDenoisedresponseText = asrOutBeforeDenoised[0]?.source;
          }

          if (CreateLearnerProfileDto.output[0].source === "") {
            return response.status(HttpStatus.BAD_REQUEST).send({
              status: "error",
              message: "Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly"
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
        let constructTokens = [];// Storing the chars and their scores from the ASR Output for the constructed text
        if (CreateLearnerProfileDto.contentType.toLowerCase() == 'word') {

          // const responseWord = CreateLearnerProfileDto.output[0].source;
          constructTokens = await this.scoresService.processTokens(CreateLearnerProfileDto.output[0].nBestTokens)
          const wordsWithValues = await this.scoresService.generateWords(constructTokens);

          if (originalText.includes('ం') || originalText.includes('ర')) {

            let agreeableResults = await this.scoresService.replaceCharacters(originalText);
            let agreeableHighestSimilarity = await this.scoresService.findAllSimilarities(wordsWithValues, [originalText, ...agreeableResults]);

            responseText = agreeableHighestSimilarity[0];
            tokenArr = agreeableHighestSimilarity[1];
            anamolyTokenArr = agreeableHighestSimilarity[2];

          }
          else {

            let constructedHighestSimilarity = await this.scoresService.findAllSimilarities(wordsWithValues, [originalText])
            /*checks whether the ASR has highest similarity or constructed has highest
              and assign to the response text*/
            let originalSimilarity = await this.scoresService.getTextSimilarity(nonDenoisedresponseText, originalText)

            if (originalSimilarity >= constructedHighestSimilarity[3]) {
              responseText = nonDenoisedresponseText;
              flag = 1;
            }

            else { //if the constructed has highesr similarity we'll be pushing the usedArr into tokenArr and unusedArr into anamolyTokenArr
              responseText = constructedHighestSimilarity[0];
              tokenArr = constructedHighestSimilarity[1];
              anamolyTokenArr = constructedHighestSimilarity[2];
            }
          }
        }
        else { //if the response has higher then response will be same as ASR output
          responseText = CreateLearnerProfileDto.output[0].source;
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

        for (let originalEle of CreateLearnerProfileDto.original_text.split(" ")) {
          let originalRepCount = 0;
          for (let sourceEle of responseText.split(" ")) {
            let similarityScore = await this.scoresService.getTextSimilarity(originalEle, sourceEle)
            if (similarityScore >= 0.40) {
              compareCharArr.push({ original_text: originalEle, response_text: sourceEle, score: await this.scoresService.getTextSimilarity(originalEle, sourceEle) });
              //break;
            }
            if (similarityScore >= 0.60) {
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
            if (compareCharArrEle.original_text === compareCharArrCmpEle.original_text) {
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

        for (let constructTextELE of constructText.split("")) {
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

        missingTokens = Array.from(missingTokenSet)

        let filteredTokenArr = [];

        //token list for ai4bharat response


        // Create Single Array from AI4bharat tokens array
        if (CreateLearnerProfileDto.contentType.toLowerCase() != 'word' || flag == 1) {
          CreateLearnerProfileDto.output[0].nBestTokens.forEach(element => {
            element.tokens.forEach(token => {
              let key = Object.keys(token)[0];
              let value = Object.values(token)[0];

              let insertObj = {};
              insertObj[key] = value;
              tokenArr.push(insertObj);

              let key1 = Object.keys(token)[1];
              let value1 = Object.values(token)[1];
              insertObj = {}
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
          for (let keyEle of tokenString.split("")) {
            if (vowelSignArr.includes(keyEle)) {
              if (isPrevVowel) {
                let prevEleArr = prevEle.split("");
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
              prevEle = keyEle
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

            for (let keyEle of tokenString.split("")) {
              let scoreVal: any = tokenValue;
              let charEle: any = keyEle;

              if (vowelSignArr.includes(charEle)) {
                if (isPrevVowel) {
                  let prevCharArr = prevChar.split("");
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
          let score: any = value.charvalue

          let identification_status = 0;
          if (score >= 0.90) {
            identification_status = 1;
          } else if (score >= 0.40) {
            identification_status = -1;
          } else {
            identification_status = 0;
          }

          if (value.charkey !== "" && value.charkey !== "▁") {
            if (correctTokens.includes(value.charkey)) {
              let hexcode = getTokenHexcode(value.charkey);

              if (hexcode !== '') {
                confidence_scoresArr.push(
                  {
                    token: value.charkey,
                    hexcode: hexcode,
                    confidence_score: value.charvalue,
                    identification_status: identification_status
                  }
                );
              } else {
                if (!missingTokens.includes(value.charkey) && !constructTokenArr.includes(value.charkey)) {
                  anomaly_scoreArr.push(
                    {
                      token: value.charkey.replaceAll("_", ""),
                      hexcode: hexcode,
                      confidence_score: value.charvalue,
                      identification_status: identification_status
                    }
                  );
                }
              }
            }
          }
        }

        for (let missingTokensEle of missingTokenSet) {
          let hexcode = getTokenHexcode(missingTokensEle);

          if (hexcode !== '') {
            if (telguVowelSignArr.includes(missingTokensEle)) { } else {
              if (!uniqueChar.has(missingTokensEle)) {
                missing_token_scoresArr.push(
                  {
                    token: missingTokensEle,
                    hexcode: hexcode,
                    confidence_score: 0.10,
                    identification_status: 0
                  }
                );
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
              if (telguVowelSignArr.includes(tokenString)) { } else {
                anomaly_scoreArr.push(
                  {
                    token: tokenString.replaceAll("_", ""),
                    hexcode: hexcode,
                    confidence_score: tokenValue,
                    identification_status: 0
                  }
                );
              }
            }

          }

        }

        const url = process.env.ALL_TEXT_EVAL_API + "/getTextMatrices";

        const textData = {
          "reference": CreateLearnerProfileDto.original_text,
          "hypothesis": CreateLearnerProfileDto.output[0].source,
          "language": "te",
          "base64_string": audioFile.toString('base64')
        };

        const textEvalMatrices = await lastValueFrom(
          this.httpService.post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
            }
          }).pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw 'Error from text Eval service' + error;
            }),
          )
        );

        if (process.env.denoiserEnabled === "true") {
          let improved = false;

          let similarityScoreNonDenoisedResText = await this.scoresService.getTextSimilarity(originalText, nonDenoisedresponseText);
          let similarityScoreDenoisedResText = await this.scoresService.getTextSimilarity(originalText, DenoisedresponseText);

          if (similarityScoreDenoisedResText > similarityScoreNonDenoisedResText) {
            improved = true;
          }

          let createDenoiserOutputLog = {
            user_id: user_id,
            session_id: CreateLearnerProfileDto.session_id,
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "",
            contentType: CreateLearnerProfileDto.contentType,
            contentId: CreateLearnerProfileDto.contentId || "",
            language: language,
            original_text: originalText,
            response_text: nonDenoisedresponseText,
            denoised_response_text: DenoisedresponseText,
            improved: improved,
            comment: ""
          }

          await this.scoresService.addDenoisedOutputLog(createDenoiserOutputLog);
        }

        let wer = textEvalMatrices.wer;
        let cercal = textEvalMatrices.cer * 2;
        let charCount = Math.abs(CreateLearnerProfileDto.original_text.length - CreateLearnerProfileDto.output[0].source.length);
        let wordCount = Math.abs(CreateLearnerProfileDto.original_text.split(' ').length - CreateLearnerProfileDto.output[0].source.split(' ').length);
        let repetitions = reptitionCount;
        let pauseCount = pause_count;
        let ins = textEvalMatrices.insertion.length;
        let del = textEvalMatrices.deletion.length;
        let sub = textEvalMatrices.substitution.length;

        let fluencyScore = ((wer * 5) + (cercal * 10) + (charCount * 10) + (wordCount * 10) + (repetitions * 10) + (pauseCount * 10) + (ins * 20) + (del * 15) + (sub * 5)) / 100;

        let createdAt = new Date().toISOString().replace('Z', '+00:00')

        createScoreData = {
          user_id: user_id, // userid sent by client
          session: {
            session_id: CreateLearnerProfileDto.session_id, // working logged in session id
            sub_session_id: CreateLearnerProfileDto.sub_session_id || "", // used to club set recorded data within session
            contentType: CreateLearnerProfileDto.contentType, // contentType could be Char, Word, Sentence and Paragraph
            contentId: CreateLearnerProfileDto.contentId || "", // contentId of original text content shown to user to speak
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
              word: textEvalMatrices.wer
            },
            count_diff: {
              character: Math.abs(CreateLearnerProfileDto.original_text.length - CreateLearnerProfileDto.output[0].source.length),
              word: Math.abs(CreateLearnerProfileDto.original_text.split(' ').length - CreateLearnerProfileDto.output[0].source.split(' ').length)
            },
            eucledian_distance: {
              insertions: {
                chars: textEvalMatrices.insertion,
                count: textEvalMatrices.insertion.length
              },
              deletions: {
                chars: textEvalMatrices.deletion,
                count: textEvalMatrices.deletion.length
              },
              substitutions: {
                chars: textEvalMatrices.substitution,
                count: textEvalMatrices.substitution.length
              }
            },
            fluencyScore: fluencyScore.toFixed(3),
            silence_Pause: {
              total_duration: 0,
              count: textEvalMatrices.pause_count,
            },
            reptitionsCount: reptitionCount,
            asrOutput: JSON.stringify(CreateLearnerProfileDto.output),
            isRetry: false
          }
        };

        // For retry attempt detection
        const retryAttempt = await this.scoresService.getRetryStatus(
          user_id,
          CreateLearnerProfileDto.contentId,
        );

        // Store Array to DB
        await this.scoresService.create(createScoreData);

        function getTokenHexcode(token: string) {
          let result = tokenHexcodeDataArr.find(item => item.token === token);
          return result?.hexcode || '';
        }
      }
      // Cal the subsessionWise and content_id wise target.
      let targets = await this.scoresService.getTargetsBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );
      let originalTextSyllables = [];
      originalTextSyllables = await this.scoresService.getSubsessionOriginalTextSyllables(CreateLearnerProfileDto.user_id,CreateLearnerProfileDto.sub_session_id);
      targets = targets.filter((targetsEle) => { return originalTextSyllables.includes(targetsEle.character) });

      const totalTargets = targets.length;

      const fluency = await this.scoresService.getFluencyBysubSession(
        CreateLearnerProfileDto.user_id,
        CreateLearnerProfileDto.sub_session_id,
        CreateLearnerProfileDto.language,
      );

      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        msg: "Successfully stored data to learner profile",
        responseText: responseText,
        subsessionTargetsCount: totalTargets,
        subsessionFluency: parseFloat(fluency.toFixed(2)),
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }


  @ApiParam({
    name: 'sessionId',
    example: '20200765061699008295109',
  })
  @Get('/GetTargets/session/:sessionId')
  @ApiResponse({
    status: 200,
    description: 'Sending targets calculated in the whole session',
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
  @ApiOperation({ summary: 'Get Targets character by session id' })
  async GetTargetsbySession(
    @Param('sessionId') id: string,
    @Query('language') language: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const targetResult = await this.scoresService.getTargetsBySession(id, language);
      return response.status(HttpStatus.OK).send(targetResult);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

 
  @Get('/GetTargets/user')
  @ApiOperation({ summary: 'Get Targets character by user id' })
  @ApiResponse({
    status: 200,
    description: 'Sending targets calculated on the user basis',
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
    @Res() response: FastifyReply,
  ) {
    try {
      const user_id = ((request as any).user.virtual_id).toString();
      const targetResult = await this.scoresService.getTargetsByUser(
        user_id,
        language,
      );
      return response.status(HttpStatus.OK).send(targetResult);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  @ApiParam({
    name: 'subsessionId',
    example: '2020076506',
  })
  @Get('/GetTargets/subsession/:subsessionId')
  @ApiOperation({ summary: 'Get Targets character by subsessionId' })
  @ApiResponse({
    status: 200,
    description: 'Calculate the target on the basis of subsession_id',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string', example: '*' },
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
    @Param('userId') user_id:string,
    @Param('subsessionId') id: string,
    @Query('language') language: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const targetResult = await this.scoresService.getTargetsBysubSession(
        user_id,
        id,
        language
      );
      return response.status(HttpStatus.OK).send(targetResult);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  @ApiParam({
    name: 'subsessionId',
    example: '2020076506',
  })
  @Get('/GetFamiliarity/subsession/:subsessionId')
  @ApiOperation({ summary: 'Get familiarity character by sub session' })
  @ApiResponse({
    status: 200,
    description: 'Get familiarity character by sub session',
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
    @Param('userId') user_id:string,
    @Param('subsessionId') id: string,
    @Query('language') language: string,
    @Res() response: FastifyReply,
  ) {
    try {
      const familiarityResult =
        await this.scoresService.getFamiliarityBysubSession(
          user_id,
          id,
          language
        );
      return response.status(HttpStatus.OK).send(familiarityResult);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  @ApiParam({
    name: 'sessionId',
    example: '20200765061699008295109',
  })
  @Get('/GetFamiliarity/session/:sessionId')
  @ApiOperation({ summary: 'Get Familiarity of characters by session id' })
  @ApiResponse({
    status: 200,
    description: 'Get Familiarity of characters by session id',
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
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  @ApiParam({
    name: 'userId',
    example: '2020076506',
  })
  @Get('/GetFamiliarity/user')
  @ApiOperation({ summary: 'Get Familiarity of characters by user id' })
  @ApiResponse({
    status: 200,
    description: 'Response containing character score details',
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
      const user_id = ((request as any).user.virtual_id).toString();
      const familiarityResult = await this.scoresService.getFamiliarityByUser(
        user_id, language
      );
      return response.status(HttpStatus.OK).send(familiarityResult);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

 
  @Get('GetContent/char')
  @ApiOperation({
    summary:
      'Get a set of chars for the user to practice, upon feeding the Get Target Chars to Content Algorithm by user id',
  })
  @ApiResponse({
    status: 200,
    description:
      'Success response with Get content and GetTarget chars for user id',
    schema: {
      properties: {
        content: { type: 'string' },
        getTargetChar: { type: 'string' },
      },
    },
  })
  async GetContentCharbyUser(
    @Req() request: FastifyRequest,
    @Query('language') language: string,
    @Query() { contentlimit = 5 },
    @Query() { gettargetlimit = 5 },
    @Query('tags', new ParseArrayPipe({ items: String, separator: ',', optional: true })) tags: string[],
    @Res() response: FastifyReply,
  ) {
    try {
      const id =((request as any).user.virtual_id).toString();
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
      if(contentlimit < 5){
        contentlimit = 5;
      }else if( contentlimit > 20){
        contentlimit = 20
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
              'Authorization': request.headers.authorization
            },
          })
          .pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw 'Error at Content service API Call -' + error;
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
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  
  @Get('GetContent/word')
  @ApiOperation({
    summary:
      'Get a set of words for the user to practice, upon feeding the Get Target Chars to Content Algorithm by user id',
  })
  @ApiResponse({
    status: 200,
    description:
      'Success response with Get content and GetTarget chars for user id',
    schema: {
      properties: {
        content: { type: 'string' },
        getTargetChar: { type: 'string' },
      },
    },
  })
  async GetContentWordbyUser( 
    @Req() request: FastifyRequest,
    @Query('language') language: string, 
    @Query() { contentlimit = 5 }, 
    @Query() { gettargetlimit = 5 }, 
    @Query('tags', new ParseArrayPipe({ items: String, separator: ',', optional: true })) tags: string[], 
    @Res() response: FastifyReply) {
    try {
      const id =((request as any).user.virtual_id).toString();
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

      let contentComplexityLevel = await this.scoresService.getMilestoneBasedContentComplexity(currentLevel);

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
      if(contentlimit < 5){
        contentlimit = 5;
      }else if( contentlimit > 20){
        contentlimit = 20
      }

      const textData = {
        "tokenArr": getGetTargetCharArr,
        "language": language || "ta",
        "contentType": "Word",
        "limit": contentlimit || 5,
        "tags": tags || [],
        "cLevel": contentLevel,
        "complexityLevel": complexityLevel,
        "graphemesMappedObj": graphemesMappedObj,
      };

      const newContent = await lastValueFrom(
        this.httpService
          .post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': request.headers.authorization
            },
          })
          .pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw 'Error at Content service API Call -' + error;
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
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  
  @Get('GetContent/sentence')
  @ApiOperation({
    summary:
      'Get a set of sentences for the user to practice, upon feeding the Get Target Chars to Content Algorithm by user id',
  })
  @ApiResponse({
    status: 200,
    description:
      'Success response with Get content and GetTarget chars for user id',
    schema: {
      properties: {
        content: { type: 'string' },
        getTargetChar: { type: 'string' },
      },
    },
  })

  async GetContentSentencebyUser(
    @Req() request: FastifyRequest,
    @Query('language') language, 
    @Query() { contentlimit = 5 }, 
    @Query() { gettargetlimit = 5 }, 
    @Query('tags', new ParseArrayPipe({ items: String, separator: ',', optional: true })) tags: string[], 
    @Query('mechanics_id') mechanics_id, 
    @Query('level_competency', new ParseArrayPipe({ items: String, separator: ',', optional: true })) level_competency: string[], 
    @Query('story_mode') story_mode, 
    @Query('category') category:string,
    @Query('type_of_learner') type_of_learner:string,
    @Res() response: FastifyReply) {
 
    try {
      const id =((request as any).user.virtual_id).toString();
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

      let contentComplexityLevel = await this.scoresService.getMilestoneBasedContentComplexity(currentLevel);

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
      // Add the check for the limit
      if(contentlimit < 5){
        contentlimit = 5;
      }else if( contentlimit > 20){
        contentlimit = 20
      }

      const textData = {
        "tokenArr": getGetTargetCharArr,
        "language": language || "ta",
        "contentType": "Sentence",
        "limit": contentlimit || 5,
        "tags": tags || [],
        "cLevel": contentLevel,
        "complexityLevel": complexityLevel,
        "graphemesMappedObj": graphemesMappedObj,
        "mechanics_id":mechanics_id,
        "level_competency" : level_competency || [],
        "story_mode": story_mode || false
      };

      const newContent = await lastValueFrom(
        this.httpService
          .post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': request.headers.authorization
            },
          })
          .pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw 'Error at Content service API Call -' + error;
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
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

 
  @Get('GetContent/paragraph')
  @ApiOperation({
    summary:
      'Get a set of paragraphs for the user to practice, upon feeding the Get Target Chars to Content Algorithm by user id',
  })
  @ApiResponse({
    status: 200,
    description:
      'Success response with Get content and GetTarget chars for user id',
    schema: {
      properties: {
        content: { type: 'string' },
        getTargetChar: { type: 'string' },
      },
    },
  })
  async GetContentParagraphbyUser( 
    @Req() request: FastifyRequest,
    @Query('language') language, 
    @Query() { contentlimit = 5 }, 
    @Query() { gettargetlimit = 5 }, 
    @Query('tags', new ParseArrayPipe({ items: String, separator: ',', optional: true })) tags: string[], 
    @Res() response: FastifyReply) {
    try {
      const id =((request as any).user.virtual_id).toString();
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

      let contentComplexityLevel = await this.scoresService.getMilestoneBasedContentComplexity(currentLevel);

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
      if(contentlimit < 5){
        contentlimit = 5;
      }else if( contentlimit > 20){
        contentlimit = 20
      }

      const textData = {
        "tokenArr": getGetTargetCharArr,
        "language": language || "ta",
        "contentType": "Paragraph",
        "limit": contentlimit || 5,
        "tags": tags || [],
        "cLevel": contentLevel,
        "complexityLevel": complexityLevel,
        "graphemesMappedObj": graphemesMappedObj,
      };

      const newContent = await lastValueFrom(
        this.httpService
          .post(url, JSON.stringify(textData), {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': request.headers.authorization
            },
          })
          .pipe(
            map((resp) => resp.data),
            catchError((error: AxiosError) => {
              throw 'Error at Content service API Call -' + error;
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
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }


  @ApiBody({
    description: `Api request body include these schema properties.
    Based on sub session id we will calculate targets and contenttype will prepare result.
    Collection id will only used for to identify discovery set.Based on discovery set will update level`,
    schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', example: '8635444062' },
        session_id: { type: 'string', example: '86354440621701972584385' },
        sub_session_id: {
          type: 'string',
          example: '86354440621701972584385',
          description:
            'This required as result is calculated based on sub session records targets',
        },
        contentType: { type: 'string', example: 'Sentence' },
        collectionId: {
          type: 'string',
          example: '5221f84c-8abb-4601-a9d0-f8d8dd496566',
          description: 'Send collectionid only when you are doing discovery',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: `This will provide you session result with targets
    and also update level if level updation criteria matched`,
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        sessionResult: { type: 'string', example: 'pass' },
        totalTargets: { type: 'number', example: 14 },
        currentLevel: { type: 'string', example: 'm3' },
        previous_level: { type: 'string', example: 'm0' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: `Error while data is being calculate sub-session result and
    milestone level updation`,
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
    summary:
      'This API will give pass or fail result with gettarget count for records performed in the subsession. Also this API perform milestone update for discovery and showcase.',
  })
  @Post('/getSetResult')
  async getSetResult(
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply, 
    @Body() getSetResult: any) {
    try {
      const user_id = ((request as any).user.virtual_id).toString();
      let targetPerThreshold = 30;
      let contentLimit = 5;
      let milestoneEntry = true;
      let totalSyllables = 0;
      let originalTextSyllables = [];
      let is_mechanics = getSetResult.is_mechanics;

      let overallScore, isComprehension;
      let sessionResult = 'No Result';
      let max_level = getSetResult.max_level;

      
      let targets = await this.scoresService.getTargetsBysubSession(user_id,getSetResult.sub_session_id, getSetResult.language);
      let fluency = await this.scoresService.getFluencyBysubSession(user_id,getSetResult.sub_session_id, getSetResult.language);
      let familiarity = await this.scoresService.getFamiliarityBysubSession(user_id,getSetResult.sub_session_id, getSetResult.language);
      let correct_score = await this.scoresService.getCorrectnessBysubSession(getSetResult.sub_session_id, getSetResult.language);
      ({ overallScore, isComprehension } = await this.scoresService.getComprehensionScore(getSetResult.sub_session_id, getSetResult.language));

      if (is_mechanics && isComprehension) {
        if (overallScore >= 14) {
          sessionResult = 'pass';
        } else {
          sessionResult = 'fail';
        }
      }

      if (getSetResult.language != 'en') {
        originalTextSyllables = await this.scoresService.getSubsessionOriginalTextSyllables(user_id,getSetResult.sub_session_id);
        targets = targets.filter((targetsEle) => { return originalTextSyllables.includes(targetsEle.character) });
      }
      let totalTargets = targets.length;


      if(getSetResult.totalSyllableCount != undefined && getSetResult.language === "en"){
        if (getSetResult.totalSyllableCount > 50) {
          totalSyllables = 50;
        } else {
          totalSyllables = getSetResult.totalSyllableCount;
        }
      }
      else{
        totalSyllables = totalTargets + familiarity.length;
      }

      let targetsPercentage = Math.min(Math.floor((totalTargets / totalSyllables) * 100));
      let passingPercentage = Math.floor(100 - targetsPercentage);
      targetsPercentage = targetsPercentage < 0 ? 0 : targetsPercentage;
      passingPercentage = passingPercentage < 0 ? 0 : passingPercentage;

      let recordData: any = await this.scoresService.getlatestmilestone(
        user_id,
        getSetResult.language,
      );
      let previous_level = recordData[0]?.milestone_level || undefined;

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

      if (!isComprehension) {
        if (targetsPercentage <= targetPerThreshold) {
          // Add logic for the study the pic mechnics
          if (is_mechanics) {
            let correctness_score = correct_score[0]?.count_scores_gte_50 ?? 0;

            if (correctness_score >= 3) {
              sessionResult = 'pass';
            } else {
              sessionResult = 'fail';
            }
          }
          else if (getSetResult.contentType.toLowerCase() === 'word') {
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
      // NEW: Compute fluencyResult only for English showcase.
      let fluencyResult: string;
      if (!getSetResult.hasOwnProperty('collectionId') || !getSetResult.collectionId) {
        if (['en', 'kn'].includes(getSetResult.language.toLowerCase())) {
          // Determine pass threshold based on milestone level.
          // For M4+ (e.g. level >= 4) threshold is 3.0; otherwise, 2.6.
          const userLevelNum = parseInt(previous_level?.replace('m', ''), 10);
          const passThreshold = (userLevelNum >= 4) ? 3.0 : 2.6;
        
          // Retrieve all audio records for the given sub-session and language 'en' or kn
          
          const allAudioRecords = await this.scoresService.getSubSessionScores(getSetResult.sub_session_id, getSetResult.language.toLowerCase());
        
          const totalAudios = allAudioRecords.length;
          let passCount = 0;
        
          // Loop through each audio record.
          for (const record of allAudioRecords) {
            const prosody = record.prosody_fluency || {};
            const exprClass = prosody.expression_classification || "Very Disfluent";
            const smoothClass = (prosody.smoothness && prosody.smoothness.smoothness_classification) || "Very Disfluent";
            const accClass = (prosody.accuracy && prosody.accuracy.accuracy_classification) || "Very Disfluent";
            const rateClass = (prosody.rate && prosody.rate.rate_classification) || "Very Disfluent";
        
            // Convert the classification strings to numeric scores.
            const exprScore = this.scoresService.classificationToScore(exprClass);
            const smoothScore = this.scoresService.classificationToScore(smoothClass);
            const accScore = this.scoresService.classificationToScore(accClass);
            const rateScore = this.scoresService.classificationToScore(rateClass);
        
            // Compute the weighted score.
            const weightedScore = (exprScore * 0.20) + (smoothScore * 0.10) + (accScore * 0.40) + (rateScore * 0.30);

            // Determine if this record passes.
            let recordPass = false;
            if (userLevelNum >= 4) {
              if (weightedScore >= passThreshold) {
                recordPass = true;
              } else {
                // Exception: for M4+, if weightedScore is below 3.0, then check for these combinations.
                if (
                  (exprClass === 'Moderately Fluent' && smoothClass === 'Disfluent' && accClass === 'Moderately Fluent' && rateClass === 'Moderately Fluent') ||
                  (exprClass === 'Disfluent' && smoothClass === 'Fluent' && accClass === 'Moderately Fluent' && rateClass === 'Moderately Fluent') ||
                  (exprClass === 'Very Disfluent' && smoothClass === 'Moderately Fluent' && accClass === 'Moderately Fluent' && rateClass === 'Fluent')
                ) {
                  recordPass = true;
                }
              }
            } else {
              // For levels below M4, use the normal threshold.
              recordPass = (weightedScore >= passThreshold);
            }
        
            if (weightedScore >= passThreshold) {
              passCount++;
            }
          }
        
          // Even/odd logic: 
          // For even total audios: pass if passCount >= (totalAudios / 2)
          // For odd total audios: pass if passCount > (totalAudios / 2)
          if (totalAudios > 0) {
            if (totalAudios % 2 === 0) {
              fluencyResult = (passCount >= totalAudios / 2) ? 'pass' : 'fail';
            } else {
              fluencyResult = (passCount > totalAudios / 2) ? 'pass' : 'fail';
            }
          } else {
            // If no audio records are present, assign a default value.
            fluencyResult = 'fail';
          }
        }
      }
      let prosodyResult: string;
      if (!getSetResult.hasOwnProperty('collectionId') || !getSetResult.collectionId) {
        if (['en', 'kn'].includes(getSetResult.language.toLowerCase())) {
          const userLevelNum = previous_level ? parseInt(previous_level.replace('m', ''), 10) : 0;
          if (userLevelNum >= 6) {
            const allAudioRecordsProsody = await this.scoresService.getSubSessionScores(getSetResult.sub_session_id, getSetResult.language.toLowerCase());
          
            const totalAudiosProsody = allAudioRecordsProsody.length;
            let passCountProsody = 0;
          
            // Helper function: normalize classification – valid values are 'natural', 'flat', 'exaggerated', 'erratic'
            const normalizeClassification = (cls: string): string => {
              const valid = ['natural', 'flat', 'exaggerated', 'erratic'];
              const lower = cls.toLowerCase();
              return valid.includes(lower) ? lower : 'erratic';
            };
          
            for (const record of allAudioRecordsProsody) {
              const prosody = record.prosody_fluency || {};
              const pitchClass = normalizeClassification(prosody.pitch?.pitch_classification || "erratic");
              const intensityClass = normalizeClassification(prosody.intensity?.intensity_classification || "erratic");
              const tempoClass = normalizeClassification(prosody.tempo?.tempo_classification || "erratic");
          
              // Rule 1: If any feature is 'erratic', record fails.
              let recordProsodyPass = true;
              if (pitchClass === 'erratic' || intensityClass === 'erratic' || tempoClass === 'erratic') {
                recordProsodyPass = false;
              } else {
                // Rule 2: If 2 or more features are 'exaggerated', record fails.
                let exaggeratedCount = 0;
                if (pitchClass === 'exaggerated') exaggeratedCount++;
                if (intensityClass === 'exaggerated') exaggeratedCount++;
                if (tempoClass === 'exaggerated') exaggeratedCount++;
                if (exaggeratedCount >= 2) {
                  recordProsodyPass = false;
                }
              }
              if (recordProsodyPass) {
                passCountProsody++;
              }
            }
          
            if (totalAudiosProsody > 0) {
              prosodyResult = (totalAudiosProsody % 2 === 0)
                ? ((passCountProsody >= totalAudiosProsody / 2) ? 'pass' : 'fail')
                : ((passCountProsody > totalAudiosProsody / 2) ? 'pass' : 'fail');
            } else {
              prosodyResult = 'fail';
            }
          } else {
            // For users below level m6, we do not compute prosodyResult.
            prosodyResult = undefined;
          }
        }
      }
      
      // If fluencyResult is computed and is 'fail', enforce overall sessionResult to 'fail'
      if ((typeof fluencyResult !== 'undefined' && fluencyResult === 'fail') ||
          (typeof prosodyResult !== 'undefined' && prosodyResult === 'fail')) {
        sessionResult = 'fail';
      }

      let milestone_level = previous_level;

      // For Showcase, We are not sending collectionId based on this are calculating milestone

      if (
        !getSetResult.hasOwnProperty('collectionId') ||
        getSetResult.collectionId === '' ||
        getSetResult?.collectionId === undefined
      ) {
        let previous_level_id = previous_level === undefined ? 0 : parseInt(previous_level.replace("m", ""));

        if (sessionResult === 'pass') {
          if (getSetResult.language === en_config.language_code && previous_level_id >= en_config.max_milestone_level && max_level == undefined) {
            milestone_level = "m" + en_config.max_milestone_level;
          }else if (getSetResult.language === en_config.language_code && previous_level_id >= max_level) {
            milestone_level = "m" + max_level;
          } else if (getSetResult.language === ta_config.language_code && previous_level_id >= ta_config.max_milestone_level) {
            milestone_level = "m" + ta_config.max_milestone_level;
          } else if (getSetResult.language != en_config.language_code && previous_level_id >= ta_config.max_milestone_level) {
            milestone_level = ta_config.max_milestone_level;
          } else {
            milestone_level = 'm' + (previous_level_id + 1);
          }

        }
      } else {
        // This collection_id is for the M0 collection
        // This collection_id is for the Ta
        if (getSetResult.collectionId === '5221f84c-8abb-4601-a9d0-f8d8dd496566' ||
          getSetResult.collectionId === 'e9c7d535-3e98-4de1-b638-fae9413d7c09' ||
          getSetResult.collectionId === '575fbb16-5b6c-43d8-96ca-f2288251b45e' ||
          (getSetResult.collectionId === '7c736010-6c8f-42b7-b61a-e6f801b3e163' &&
            getSetResult.language === 'ta')) {
          milestone_level = 'm0';

          if (previous_level === undefined) {
            previous_level = 'm0';
          }

          // This collection_id is for the Kn
        } else if (getSetResult.collectionId === '1cc3b4d4-79ad-4412-9325-b7fb6ca875bf' ||
          getSetResult.collectionId === '976a7631-3887-4d18-9576-7ca8205b82e8' ||
          getSetResult.collectionId === '9374ae97-80e4-419b-8e96-784734317e82' ||
          (getSetResult.collectionId === 'e6f3537d-7a34-4b08-9824-0ddbc4c49be3' &&
            getSetResult.language === 'kn')) {
          milestone_level = 'm0';
          if (previous_level === undefined) {
            previous_level = 'm0';
          }

          // This collection_id is for the En
        } else if (getSetResult.collectionId === '36e4cff0-0552-4107-b8f4-9f9c5a3ff3c1' ||
          getSetResult.collectionId === 'fba7282d-aba3-4e95-8916-40b79f9e3f50' ||
          getSetResult.collectionId === '3c62cb34-9565-4b81-8e96-da86d90b6072' ||
          (getSetResult.collectionId === 'c637ac92-2ecf-4015-82e9-c4002479ae32' &&
            getSetResult.language === 'en')) {
          milestone_level = 'm0';
          if (previous_level === undefined) {
            previous_level = 'm0';
          }

          // This collection_id is for the Te
        } else if (getSetResult.collectionId === '8b5023d6-bafe-4cbe-8967-1f3f19481e4f' ||
          getSetResult.collectionId === '1df7cb53-4609-4ba0-a0dc-2e4dc188619a' ||
          getSetResult.collectionId === 'cfbd93f9-10f6-4064-ab0f-f2f8d6e45e6a' ||
          (getSetResult.collectionId === 'd6f84966-53fa-44bb-93d9-598c84974f04' &&
            getSetResult.language === 'te')) {
          milestone_level = 'm0';
          if (previous_level === undefined) {
            previous_level = 'm0';
          }

          // This collection_id is for the Gu
        } else if (getSetResult.collectionId === '1394ade3-cc95-48cd-98ca-f3288860b0e1' ||
          getSetResult.collectionId === 'eea19621-ae97-4a5d-9933-882a493c84d8' ||
          getSetResult.collectionId === '61ef8260-98c5-4bc0-9ccd-43cd34c6ecab' ||
          (getSetResult.collectionId === '3ac7bf14-4455-4e20-9dd4-2af2a04a8227' &&
            getSetResult.language === 'gu')) {
          milestone_level = 'm0';
          if (previous_level === undefined) {
            previous_level = 'm0';
          }

          // This collection_id is for the Hi
        } else if (getSetResult.collectionId === '0d00c89d-5c73-4de1-9153-c300c972ad64' ||
          getSetResult.collectionId === 'f10b7f82-8a1a-4448-b319-6eea17acff26' ||
          getSetResult.collectionId === '9e77a188-6785-4e56-b2d0-bfac97bcc6a2' ||
          (getSetResult.collectionId === '7765ff21-e07a-4a68-9b42-18751f504ef0' &&
            getSetResult.language === 'hi')) {
          milestone_level = 'm0';
          if (previous_level === undefined) {
            previous_level = 'm0';
          }
          // This collection_id is for the or
        } else if (getSetResult.collectionId === '010ba3e3-f6b4-4a4a-856e-e323a288b98e' ||
          getSetResult.collectionId === '971cdd0b-989f-429b-999a-620c10c670b5' ||
          getSetResult.collectionId === '104fff5c-9f00-4268-92bb-9697f943035a' ||
          (getSetResult.collectionId === 'a4947dd3-e9af-4e0c-b8e9-52ed77a1e8cf' &&
            getSetResult.language === 'or')) {
          milestone_level = 'm0';
          if (previous_level === undefined) {
            previous_level = 'm0';
          }

        } else {
          if (getSetResult.language === 'ta' &&
            getSetResult.collectionId !== '' &&
            getSetResult.collectionId !== undefined
          ) {

            // this collection id is for M2
            if (getSetResult.collectionId === 'bd20fee5-31c3-48d9-ab6f-842eeebf17ff' ||
              getSetResult.collectionId === '61bc9579-0f9b-47ae-b446-7cdd525ce413' ||
              getSetResult.collectionId === '76ef507c-5d56-457c-aa3a-647cf5dba545' ||
              getSetResult.collectionId === '55767bfa-0e12-4d8f-999b-e84daf6c7587') {
              if (sessionResult === 'pass') {
                milestone_level = 'm2';
              } else {
                milestone_level = 'm1';
              }
              // this collection id is for M3
            } else if (getSetResult.collectionId === '986ff23e-8b56-4366-8510-8a7e7e0f36da' ||
              getSetResult.collectionId === '85d58650-0771-4b28-b185-d074b5a5982d' ||
              getSetResult.collectionId === '461d9b9e-0db6-48ce-9088-d377d0cd33a6' ||
              getSetResult.collectionId === '2b196c2a-5f8e-4507-ac60-98d9fe6ae12b') {
              if (sessionResult === 'fail') {
                milestone_level = 'm3';
              } else {
                milestoneEntry = false;
              }
              // This collection id is for m4
            } else if (getSetResult.collectionId === '67b820f5-096d-42c2-acce-b781d59efe7e' ||
              getSetResult.collectionId === '895518d8-64ec-406d-a3d9-44c4ba8d2e57' ||
              getSetResult.collectionId === 'b83971a5-22a8-46ea-90ab-485182c7cd9d' ||
              getSetResult.collectionId === '68dfd9cb-a33d-4d15-a3ea-54755f8311c8') {
              milestone_level = 'm4';

              // This Collection id is for m1
            } else if (getSetResult.collectionId === '94312c93-5bb8-4144-8822-9a61ad1cd5a8' ||
              getSetResult.collectionId === '67697c4f-fdd2-446b-b765-f610bc2c355c' ||
              getSetResult.collectionId === 'f9ea2715-0d1b-465e-83f9-54c77341f388' ||
              getSetResult.collectionId === 'ed47eb63-87c8-41f4-821d-1400fef37b78') {
              milestone_level = 'm1';
            }
          } else if (
            getSetResult.language === 'kn' &&
            getSetResult.collectionId !== '' &&
            getSetResult.collectionId !== undefined
          ) {
            if (
              getSetResult.collectionId === 'b755df98-198b-440a-90e0-391579ef4bfb' ||
              getSetResult.collectionId === '4a8bddeb-cddd-4b64-9845-662a0d287c34' ||
              getSetResult.collectionId === 'f9b877d2-4994-4eab-998c-aacaf0076b5a' ||
              getSetResult.collectionId === '6a89f990-8727-49da-b128-b7ea1839d025'
            ) {
              if (sessionResult === 'pass') {
                milestone_level = 'm2';
              } else {
                milestone_level = 'm1';
              }
            } else if (
              getSetResult.collectionId === '29bb9cff-9510-4693-bec5-9436a686b836' ||
              getSetResult.collectionId === '5828539f-4b1f-4502-b648-b2843d61f35d' ||
              getSetResult.collectionId === '37a406a5-d82e-447d-9762-17c76f5005ef' ||
              getSetResult.collectionId === '69b5512e-7b9f-43a6-9e6c-b25fb83b8661'
            ) {
              if (sessionResult === 'fail') {
                milestone_level = 'm3';
              } else {
                milestoneEntry = false;
              }
            } else if (
              getSetResult.collectionId === 'a2c5e2ef-27b8-43d0-9c17-38cdcfe50f4c' ||
              getSetResult.collectionId === '390c8719-fc52-42f3-b49d-41547a0639d7' ||
              getSetResult.collectionId === 'aee5f3f4-213c-4596-8074-0addab60122a' ||
              getSetResult.collectionId === 'e28d2463-adca-46e6-8159-04c99d6158d3'
            ) {
              milestone_level = 'm4';
            } else if (
              getSetResult.collectionId === 'ac930427-4a73-41a8-94d5-be74defd2993' ||
              getSetResult.collectionId === '086482ed-9748-4c74-93b1-fe24dd6c98c7' ||
              getSetResult.collectionId === '272a648e-f2a3-41a4-a3dd-6ebf4b5ec40d' ||
              getSetResult.collectionId === '61b65b9b-94b8-4212-94e5-33ce8e80435a'
            ) {
              milestone_level = 'm1';
            }
          } else if (
            getSetResult.language === 'en' &&
            getSetResult.collectionId !== '' &&
            getSetResult.collectionId !== undefined
          ) {
            if (
              getSetResult.collectionId === '91a5279d-f4a2-4c4d-bc8f-0b15ba6e5995' ||
              getSetResult.collectionId === 'd6d95b4a-9d74-48ff-8f75-a606d5672764' ||
              getSetResult.collectionId === 'f99ff325-05c0-4cff-b825-b2cbb9638300' ||
              getSetResult.collectionId === '775c974a-4bda-4cfc-bc47-2aff56e39c46'
            ) {
              if (sessionResult === 'pass') {
                milestone_level = 'm2';
              } else {
                milestone_level = 'm1';
              }
            } else if (
              getSetResult.collectionId === 'f9eb8c70-524f-46a1-a737-1eec64a42e6f' ||
              getSetResult.collectionId === 'f24d6660-c759-44f9-a4ae-5b46b62098b2' ||
              getSetResult.collectionId === 'f6b5638d-4398-4cf4-833c-42a4695a6425' ||
              getSetResult.collectionId === '87c2866e-6249-4fe1-9b1b-8b22ddd05ea7'
            ) {
              if (sessionResult === 'fail') {
                milestone_level = 'm3';
              } else {
                milestoneEntry = false;
              }
            } else if (
              getSetResult.collectionId === 'e62061ea-4195-4460-b8e3-c0433bf8624e' ||
              getSetResult.collectionId === 'e276d47b-b262-4af1-b424-ead68b2b83bf' ||
              getSetResult.collectionId === 'b9ab3b2f-5c21-4c61-b9c8-90898b5278dd' ||
              getSetResult.collectionId === '809039e5-119d-42ae-925f-b2546b1e3d7b'
            ) {
              milestone_level = 'm4';
            } else if (
              getSetResult.collectionId === '5b69052e-f609-4004-adce-cf0fcfdac98b' ||
              getSetResult.collectionId === '30c5800e-4a02-4259-8328-abf57e4255ca' ||
              getSetResult.collectionId === 'b2eb8d4a-5d2b-441a-8269-0151e089c253' ||
              getSetResult.collectionId === 'b12b79ec-f7cb-44b4-99c9-5ea747d4f99a'
            ) {
              milestone_level = 'm1';
            }
          } else if (
            getSetResult.language === 'te' &&
            getSetResult.collectionId !== '' &&
            getSetResult.collectionId !== undefined
          ) {
            if (
              getSetResult.collectionId === '9682eee7-f6dc-4277-9ff7-1d1f4f079020' ||
              getSetResult.collectionId === '45e148f0-c591-479f-becd-2e1f85caf11e' ||
              getSetResult.collectionId === '33fb7dfa-4c51-42dd-b4cd-7a38747b96f4' ||
              getSetResult.collectionId === '5a5560e8-e22a-402c-a6da-fb93bfc2b335'
            ) {
              if (sessionResult === 'pass') {
                milestone_level = 'm2';
              } else {
                milestone_level = 'm1';
              }
            } else if (
              getSetResult.collectionId === '3b339169-df4e-4490-8ff4-4616370ba9af' ||
              getSetResult.collectionId === '7d1d2108-c742-470b-9af9-988411bc05d6' ||
              getSetResult.collectionId === 'edc2b898-ba23-4cc6-83c4-54a567a83f09' ||
              getSetResult.collectionId === '835f0357-f0fe-45ba-8ec1-d55f19d80b3c'
            ) {
              if (sessionResult === 'fail') {
                milestone_level = 'm3';
              } else {
                milestoneEntry = false;
              }
            } else if (
              getSetResult.collectionId === '56b06985-fe48-4a89-9b1f-a9f3c6cf1e28' ||
              getSetResult.collectionId === 'c76fe38d-0881-4b36-aaa2-85dc679a5640' ||
              getSetResult.collectionId === '81faf48a-e37c-4909-80de-4ff7d7f204f0' ||
              getSetResult.collectionId === 'd4652c35-a39c-44ca-b833-74504efc69ab'
            ) {
              milestone_level = 'm4';
            } else if (
              getSetResult.collectionId === '21a6619e-bb15-4b49-823e-68bfc703e394' ||
              getSetResult.collectionId === '74102541-9127-4c2e-aa6f-e19f9b914f42' ||
              getSetResult.collectionId === '34651976-b302-4ddf-b858-236b5e4eb093' ||
              getSetResult.collectionId === '55149fbb-4fb1-4e4d-9b77-16e30e537b21'
            ) {
              milestone_level = 'm1';
            }
          } else if (
            getSetResult.language === 'gu' &&
            getSetResult.collectionId !== '' &&
            getSetResult.collectionId !== undefined

            // this collection id is for M2
          ) {
            if (
              getSetResult.collectionId === 'e1e87800-f530-4868-aebe-4f2402d29eb8' ||
              getSetResult.collectionId === '9fa1173e-307f-4c47-af07-482228667f2c' ||
              getSetResult.collectionId === '3d0a5345-2acb-4ed1-919d-fc6511417ed2' ||
              getSetResult.collectionId === '42e4140b-4294-424f-b488-f0c53fc376c9'
            ) {
              if (sessionResult === 'pass') {
                milestone_level = 'm2';
              } else {
                milestone_level = 'm1';
              }
              // this collection id is for M3
            } else if (
              getSetResult.collectionId === '6e856dc6-073d-43fe-9086-2bc5869eca86' ||
              getSetResult.collectionId === '4c7e2f94-25e1-4bd7-a04c-7bfa7a54d187' ||
              getSetResult.collectionId === '8da5ddf4-8e22-4c69-97bc-2edf1f5d5e18' ||
              getSetResult.collectionId === 'f70b2c60-f321-4ddf-90c9-5038a23b6595'
            ) {
              if (sessionResult === 'fail') {
                milestone_level = 'm3';
              } else {
                milestoneEntry = false;
              }
              // This collection id is for m4
            } else if (
              getSetResult.collectionId === '0601c390-01a8-4887-8029-1cd9852abac6' ||
              getSetResult.collectionId === '85e45847-bdc1-4421-b9d0-b3592b9a068a' ||
              getSetResult.collectionId === '4299a52a-0932-4ebd-b33f-5dab9ecb7e76' ||
              getSetResult.collectionId === 'c78fdc09-11d9-4209-acd1-3e4d550857bf'
            ) {
              milestone_level = 'm4';
              // This Collection id is for m1
            } else if (
              getSetResult.collectionId === '24d4b913-1f5a-45cd-8b72-7e7125f56920' ||
              getSetResult.collectionId === '5eb9babf-2ec1-4760-9e6e-d515ddb8f405' ||
              getSetResult.collectionId === 'b8830bb6-dee3-46f9-b7e3-09aca044ceef' ||
              getSetResult.collectionId === '14209021-7373-42ac-b02d-a32f0ee89ef9'
            ) {
              milestone_level = 'm1';
            }
          }
          else if (
            getSetResult.language === 'hi' &&
            getSetResult.collectionId !== '' &&
            getSetResult.collectionId !== undefined

            // this collection id is for M2
          ) {
            if (
              getSetResult.collectionId === '6f64d4a2-b6e5-4a2b-91e5-f6be9f2d4d8b' ||
              getSetResult.collectionId === '00644696-a8b6-48fc-b73f-25a0da567a14' ||
              getSetResult.collectionId === '2a1a6894-d953-4a26-a294-a7f66469b209' ||
              getSetResult.collectionId === 'e0bdd73c-dd8b-4c2b-92cf-be753fd32c46'
            ) {
              if (sessionResult === 'pass') {
                milestone_level = 'm2';
              } else {
                milestone_level = 'm1';
              }
              // this collection id is for M3
            } else if (
              getSetResult.collectionId === 'ab289254-45b1-40ed-9b84-3e414577120f' ||
              getSetResult.collectionId === '98a53df5-c4e3-4045-870d-1154f1e5023a' ||
              getSetResult.collectionId === '8c438757-e35b-4beb-ae5f-015a9ed3f7f6' ||
              getSetResult.collectionId === 'a8492aad-b904-406a-bae1-e3f6ebda48ca'
            ) {
              if (sessionResult === 'fail') {
                milestone_level = 'm3';
              } else {
                milestoneEntry = false;
              }
              // This collection id is for m4
            } else if (
              getSetResult.collectionId === 'ee548dec-f599-47a4-8767-bddadb20ed70' ||
              getSetResult.collectionId === 'a1cd9d37-2fe1-429f-8830-dde473b9e87f' ||
              getSetResult.collectionId === '1da05e37-8ddc-4a5e-b059-abaa3ef45198' ||
              getSetResult.collectionId === '62fca34f-12da-4017-83f5-ae88bf99c48d'
            ) {
              milestone_level = 'm4';
              // This Collection id is for m1
            } else if (
              getSetResult.collectionId === '919aba0b-7443-4d6c-a1dc-e7b42a803496' ||
              getSetResult.collectionId === 'd95a1672-70d3-437f-92da-9013a4e5e593' ||
              getSetResult.collectionId === 'dfe36bd6-91d5-436e-b283-0dc3704f19f5' ||
              getSetResult.collectionId === 'e0021945-8948-4467-a256-13b5bfbbe6af'
            ) {
              milestone_level = 'm1';
            }
          }
          if (getSetResult.language === 'or' &&
            getSetResult.collectionId !== '' &&
            getSetResult.collectionId !== undefined
          ) {

            // this collection id is for M2
            if (getSetResult.collectionId === 'f1c48b67-9876-4058-a2d0-d38c8bb4e3fd' ||
              getSetResult.collectionId === '7dcb258c-8cb8-41cd-971f-15e46fa2136d' ||
              getSetResult.collectionId === '647d40b3-35d6-415f-9a41-2388d8ca147f' ||
              getSetResult.collectionId === '52e6cdfc-3f1e-4ca6-84ff-4a2ab04c2cfc') {
              if (sessionResult === 'pass') {
                milestone_level = 'm2';
              } else {
                milestone_level = 'm1';
              }
              // this collection id is for M3
            } else if (getSetResult.collectionId === 'baf0e828-caad-4597-80c3-e76503b62bbe' ||
              getSetResult.collectionId === 'ea3c6696-498b-4827-bc6c-3740fad6adfd' ||
              getSetResult.collectionId === '543a324d-9ade-4621-aa04-2ef16540ac87' ||
              getSetResult.collectionId === '19b1e674-e633-4339-9365-e1ade2fc5f59') {
              if (sessionResult === 'fail') {
                milestone_level = 'm3';
              } else {
                milestoneEntry = false;
              }
              // This collection id is for m4
            } else if (getSetResult.collectionId === '3ffd72bc-d45d-4148-a3d5-b786b0a00924' ||
              getSetResult.collectionId === 'c647f7e8-29f8-4b92-98f4-7995d6dd05e4' ||
              getSetResult.collectionId === '1501b007-1136-4360-838f-84c4a2a50a8c' ||
              getSetResult.collectionId === '4a261a24-187e-4616-954c-c2e9d38189ac') {
              milestone_level = 'm4';

              // This Collection id is for m1
            } else if (getSetResult.collectionId === '59f80fb8-5ff4-4739-b7ad-3811af25b575' ||
              getSetResult.collectionId === 'e5f7a86f-3b9f-4dc4-b64f-ff8ade0b88c3' ||
              getSetResult.collectionId === 'c9564b7a-7854-4989-a43c-1a20a253d6b2' ||
              getSetResult.collectionId === 'bf48828e-2b54-462d-a12b-59025e2c1fd7') {
              milestone_level = 'm1';
            }
          }
        }
      }

      let currentLevel = milestone_level;

      if (milestoneEntry) {
        await this.scoresService
          .createMilestoneRecord({
            user_id: user_id,
            session_id: getSetResult.session_id,
            sub_session_id: getSetResult.sub_session_id,
            milestone_level: milestone_level,
            sub_milestone_level: '',
          })
          .then(async () => {
            recordData = await this.scoresService.getlatestmilestone(
              user_id,
              getSetResult.language,
            );

            currentLevel = recordData[0]?.milestone_level || undefined;

            if (currentLevel === undefined) {
              currentLevel = previous_level;
            } else if (getSetResult.contentType.toLowerCase() === 'char') {
              currentLevel = milestone_level;
            }
          });
      }
      if (!( (getSetResult.language.toLowerCase() === 'en' || getSetResult.language.toLowerCase() === 'kn') && (!getSetResult.hasOwnProperty('collectionId') || !getSetResult.collectionId) )) {
        fluencyResult = undefined; 
        prosodyResult = undefined;
      }
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
          percentage: passingPercentage || 0,
          targetsPercentage: targetsPercentage || 0,
          total_correctness_score:correct_score[0]?.total_correctness_score / contentLimit || 0,
          comprehensionScore: overallScore
        },
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }


  @ApiOperation({
    summary: 'This API will give you current milestone level of user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Success response with current milestone level of user',
    schema: {
      properties: {
        milestone_level: { type: 'string', example: 'm0' },
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
      const id =((request as any).user.virtual_id).toString();
      const recordData: any = await this.scoresService.getlatestmilestone(
        id,
        language,
      );
      const milestone_level = recordData[0]?.milestone_level || 'm0';
      return response.status(HttpStatus.CREATED).send({
        status: 'success',
        data: { milestone_level: milestone_level },
      });
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: 'error',
        message: 'Server error - ' + err,
      });
    }
  }

  @ApiExcludeEndpoint(true)
  @Post('/GetMissingChars')
  async GetMissingChars(@Res() response: FastifyReply, @Body() storyData: any) {
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
  }

  @ApiExcludeEndpoint(true)
  @Post('/addAssessmentInput')
  async AddAssessmentInput(
    @Res() response: FastifyReply,
    @Body() assessmentInput: AssessmentInputDto,
  ) {
    const data = await this.scoresService.assessmentInputCreate(
      assessmentInput,
    );
    return response.status(HttpStatus.CREATED).send({
      status: 'success',
      msg: 'Successfully stored data to Assessment Input',
    });
  }

  @ApiExcludeEndpoint(true)
  @Get('/GetSessionIds')
  async GetSessionIdsByUser(@Req() request: FastifyRequest, @Query() { limit = 5 }) {
    const user_id =((request as any).user.virtual_id).toString();
    return this.scoresService.getAllSessions(user_id, limit);
  }


  @ApiBody({
    description: `Api request body include these schema properties.
    Based on user id we will calculate targets.`,
    schema: {
      type: 'object',
      properties: {
        userIds: {
          type: 'array',
          items: {
            type: 'string',
            example: '8297454902'
          }
        },
        language: {
          type: 'string',
          example: 'en'
        }
      },
      required: ['userIds', 'language']
    }
  })
  @ApiResponse({
    status: 201,
    description: 'This will provide you target data of users',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          user_id: { type: 'string', example: '9131490212' },
          targetData: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                character: { type: 'string', example: 'ளி' },
                score: { type: 'number', example: 0.1 }
              }
            }
          },
          targetCount: { type: 'integer', example: 56 }
        }
      }
    }
  })
  @ApiResponse({
    status: 500,
    description: `Error while fetching the users target data`,
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
    summary:
      'This API will give the users target',
  })
  @Post('/getUsersTargets')
  async GetUsersTargets(@Res() response: FastifyReply, @Body() data: any) {
    try {
      const { userIds, language } = data;
      let recordData = []
      for (const userId of userIds) {
        const userRecord = await this.scoresService.getTargetsByUser(userId, language);
        recordData.push({
          user_id: userId,
          targetData: userRecord,
          targetCount: userRecord.length
        })
      }
      return response.status(HttpStatus.OK).send(recordData);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }


  @ApiBody({
    description: `Api request body include these schema properties.
    Based on user id we will calculate familirity.`,
    schema: {
      type: 'object',
      properties: {
        userIds: {
          type: 'array',
          items: {
            type: 'string',
            example: '8297454902'
          }
        },
        language: {
          type: 'string',
          example: 'en'
        }
      },
      required: ['userIds', 'language']
    }
  })
  @ApiResponse({
    status: 201,
    description: 'This will provide you familiarity of users',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          user_id: { type: 'string', example: '8297454902' },
          familiarityData: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                character: { type: 'string', example: 'ɪ' },
                latestScores: { type: 'array', items: { type: 'number', example: 0.99 } },
                countBelowThreshold: { type: 'integer', example: 1 },
                countAboveThreshold: { type: 'integer', example: 4 },
                score: { type: 'number', example: 0.812 }
              }
            }
          },
          familiarityCount: { type: 'integer', example: 5 }
        }
      }
    }
  })
  @ApiResponse({
    status: 500,
    description: `Error while fetching the users familiarity data`,
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
    summary:
      'This API will give the users familiarity',
  })
  @Post('/getUsersFamiliarity')
  async GetUsersFamiliarity(@Res() response: FastifyReply, @Body() data: any) {
    try {
      const { userIds, language } = data;
      let recordData = []
      for (const userId of userIds) {
        const familiarityRecord = await this.scoresService.getFamiliarityByUser(userId, language);

        recordData.push({
          user_id: userId,
          familiarityData: familiarityRecord,
          familiarityCount: familiarityRecord.length
        })
      }
      return response.status(HttpStatus.OK).send(recordData);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }


  @ApiBody({
    description: `Api request body include these schema properties.
    Based on user id we will send the milestone level.`,
    schema: {
      type: 'object',
      properties: {
        user_ids: { type: 'array', example: ['8635444062', '8635444063'] },
        language: { type: 'string', example: "ta" }
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: `This will provide you familiarity of users`,
    schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', example: '8591582684' },
        data: {
          type: 'object', example: {
            milestone_level: { type: 'string', example: 'm0' }
          }
        }
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: `Error while fetching the users milestone data`,
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
    summary:
      'This API will give the users milestone level',
  })
  @Post('/getUsersMilestones')
  async getUsersMilestones(@Res() response: FastifyReply, @Body() data: any) {
    try {
      const { userIds, language } = data;
      let recordData = [];
      for (const userId of userIds) {
        let milestoneData: any = await this.scoresService.getlatestmilestone(userId, language);
        let milestone_level = milestoneData[0]?.milestone_level || "m0";

        recordData.push({
          user_id: userId,
          data: { milestone_level: milestone_level },
        });
      }
      return response.status(HttpStatus.OK).send(recordData);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }


  @ApiBody({
    description: `Api request body include these schema properties.
    Based on user id we will send the profile related data.`,
    schema: {
      type: 'object', properties: {
        user_id: { type: 'string', example: '8635444062' },
        language: { type: 'string', example: "ta" }
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'This will provide you Target and Familiarity data of user',
    schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', example: 'pass' },
        Target: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              subSessionId: { type: 'string', example: '8635444062' },
              createdAt: { type: 'string', format: 'date-time', example: '2023-10-16T08:25:43.934Z' },
              score: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    character: { type: 'string', example: 'd' },
                    latestScores: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          score: { type: 'number', example: 0.1 },
                          original_text: { type: 'string', example: 'நீலா பூந்தோ' },
                          response_text: { type: 'string', example: 'நீலா பூந்தோ' },
                          countBelowThreshold: { type: 'number', example: 0.1 },
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
        Familiarity: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              subSessionId: { type: 'string', example: '8635444062' },
              createdAt: { type: 'string', format: 'date-time', example: '2023-10-16T08:25:43.934Z' },
              score: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    character: { type: 'string', example: 'd' },
                    latestScores: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          score: { type: 'number', example: 0.1 },
                          original_text: { type: 'string', example: 'நீலா பூந்தோ' },
                          response_text: { type: 'string', example: 'நீலா பூந்தோ' },
                          countBelowThreshold: { type: 'number', example: 0.1 },
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
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: `Error while fetching the users familiarity & Target data`,
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
    summary:
      'This API will give the users familiarity & Target',
  })
  @Post('/getUserProfile')
  async GetUserProfile(@Res() response: FastifyReply, @Body() data: any) {
    try {
      const { userId, language } = data;
      let target_Data: any = []
      let famalarity_Data: any = [];
      const subsessionData: any = await this.scoresService.getSubessionIds(userId);

      for (const subsession of subsessionData) {
        const subSessionId = subsession.sub_session_id;
        const createdAt = subsession.createdAt
        const famalarityData = await this.scoresService.getFamiliarityBysubSessionUserProfile(subSessionId, language);
        if (famalarityData) {
          famalarity_Data.push({
            subSessionId: subSessionId,
            createdAt: createdAt,
            score: famalarityData || []
          })
        }
        const targetData = await this.scoresService.getTargetsBysubSessionUserProfile(subSessionId, language);
        if (targetData) {
          target_Data.push({
            subSessionId: subSessionId,
            createdAt: createdAt,
            score: targetData || []
          })
        }
      }
      const finalResponse = {
        Target: target_Data,
        Famalarity: famalarity_Data
      };
      return response.status(HttpStatus.OK).send(finalResponse);
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }
}