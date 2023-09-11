import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, Res } from '@nestjs/common';
import { ScoresService } from './scores.service';
import { CreateScoreDto } from './dto/create-score.dto';
import { UpdateScoreDto } from './dto/update-score.dto';
import { FastifyReply } from 'fastify';

@Controller('scores')
export class ScoresController {
  constructor(
    private readonly scoresService: ScoresService
  ) { }

  @Post()
  create(@Res() response: FastifyReply, @Body() createScoreDto: any) {
    try {

      let confidence_scoresArr = [];
      let anomaly_scoreArr = [];

      let originalText = createScoreDto.original_text;
      let responseText = createScoreDto.output[0].source;
      let originalTextTokensArr = originalText.split("");
      let responseTextTokensArr = responseText.split("");

      let correctTokens = [];
      let missingTokens = [];

      let vowelSignArr = [
        "ா",
        "ி",
        "ீ",
        "ு",
        "ூ",
        "ெ",
        "ே",
        "ை",
        "ொ",
        "ோ",
        "ௌ",
        "்",
      ];

      let prevEle = '';
      let isPrevVowel = false;


      let originalTokenArr = [];
      let responseTokenArr = [];


      for (let originalTextELE of originalText.split("")) {
        if (originalTextELE != ' ') {
          if (vowelSignArr.includes(originalTextELE)) {
            if (isPrevVowel) {
              let prevEleArr = prevEle.split("");
              prevEle = prevEleArr[0] + originalTextELE;
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

      for (let responseTextELE of responseText.split("")) {
        if (responseTextELE != ' ') {
          if (vowelSignArr.includes(responseTextELE)) {
            if (isPrevVowel) {
              let prevEleArr = prevEle.split("");
              prevEle = prevEleArr[0] + responseTextELE;
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

      for (let originalTokenArrEle of originalTokenArr) {
        if (responseTokenArr.includes(originalTokenArrEle)) {
          correctTokens.push(originalTokenArrEle);
        } else {
          missingTokens.push(originalTokenArrEle);
        }
      }

      let filteredTokenArr = [];

      //token list for ai4bharat response
      let tokenArr = [];
      let anamolyTokenArr = [];

      // Create Single Array from AI4bharat tokens array
      createScoreDto.output[0].nBestTokens.forEach(element => {
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
          if (missingTokens.includes(value.charkey) || correctTokens.includes(value.charkey)) {
            confidence_scoresArr.push(
              {
                token: value.charkey,
                hexcode: value.charkey.charCodeAt(0).toString(16),
                confidence_score: missingTokens.includes(value.charkey) && !correctTokens.includes(value.charkey) ? 0.10 : value.charvalue,
                identification_status: missingTokens.includes(value.charkey) ? 0 : identification_status
              }
            );
          }
        }
      }

      for (let missingTokensEle of missingTokens) {
        confidence_scoresArr.push(
          {
            token: missingTokensEle,
            hexcode: missingTokensEle.charCodeAt(0).toString(16),
            confidence_score: 0.10,
            identification_status: 0
          }
        );
      }

      for (let anamolyTokenArrEle of anamolyTokenArr) {
        let tokenString = Object.keys(anamolyTokenArrEle)[0];
        let tokenValue = Object.values(anamolyTokenArrEle)[0];

        if (tokenString != '') {
          anomaly_scoreArr.push(
            {
              token: tokenString,
              hexcode: tokenString.charCodeAt(0).toString(16),
              confidence_score: tokenValue,
              identification_status: 0
            }
          );
        }

      }

      let createScoreData = {
        user_id: createScoreDto.user_id,
        session: {
          session_id: createScoreDto.session_id,
          date: createScoreDto.date,
          original_text: createScoreDto.original_text,
          response_text: responseText,
          confidence_scores: confidence_scoresArr,
          anamolydata_scores: anomaly_scoreArr
        }
      };

      // Store Array to DB
      let data = this.scoresService.create(createScoreData);



      return response.status(HttpStatus.CREATED).send({ status: 'success', missingTokens: missingTokens, correctTokens: correctTokens, confidence_scoresArr: confidence_scoresArr, anomaly_scoreArr: anomaly_scoreArr, tokenArr: tokenArr, anamolyTokenArr: anamolyTokenArr })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @Post('/bulk')
  createBulk(@Res() response: FastifyReply, @Body() createScoreDto: any) {
    try {
      let data = this.scoresService.create(createScoreDto);
      return response.status(HttpStatus.CREATED).send({ status: 'success', msg: 'Successfully Added' })
    } catch (err) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
        status: "error",
        message: "Server error - " + err
      });
    }
  }

  @Get()
  findAll() {
    return this.scoresService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.scoresService.findOne(+id);
  }

  @Get('/byuser/:id')
  findbyUser(@Param('id') id: string) {
    return this.scoresService.findbyUser(id);
  }

  @Get('/bysession/:id')
  findbySession(@Param('id') id: string) {
    return this.scoresService.findbySession(id);
  }

  @Get('/GetGaps/session/:sessionId')
  GetGapsbySession(@Param('sessionId') id: string) {
    return this.scoresService.getGapBySession(id);
  }

  @Get('/GetGaps/user/:userId')
  GetGapsbyUser(@Param('userId') id: string) {
    return this.scoresService.getGapByUser(id);
  }

  @Get('/GetRecommendedWords/session/:sessionId')
  GetRecommendedWordBysession(@Param('sessionId') id: string) {
    return this.scoresService.getRecommendedWordsBySession(id);
  }

  @Get('/GetRecommendedWords/user/:userId')
  GetRecommendedWordByUser(@Param('userId') id: string) {
    return this.scoresService.getRecommendedWordsByUser(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateScoreDto: UpdateScoreDto) {
    return this.scoresService.update(+id, updateScoreDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.scoresService.remove(+id);
  }
}
