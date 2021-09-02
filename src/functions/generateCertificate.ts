import { document } from '../utils/dynamodbClient';
import chromium from 'chrome-aws-lambda';
import path from 'path';
import fs from 'fs';
import handlebars from 'handlebars';
import dayjs from 'dayjs';
import { S3} from 'aws-sdk';

interface ICreateCertificate {
    id: string;
    name: string;
    grade: string;
}

interface ITamplate {
    id: string;
    name: string;
    grade: string;
    date: string;
    medal: string;
}

const compile = async function(data: ITamplate) {

    const filePath = path.join(process.cwd(), 'src', 'templates', 'certificate.hbs');

    const html = fs.readFileSync(filePath, 'utf-8');

    return handlebars.compile(html)(data);

}

export const handle = async (event) => {

    const { id, name, grade } = JSON.parse(event.body) as ICreateCertificate;

    const response = await document.query({ 
        TableName: 'users_certificates',
        KeyConditionExpression: 'id= :id',
        ExpressionAttributeValues: { 
            ':id': id
        }
    }).promise();

    const userAlreadyExists = response.Items[0];

    if (!userAlreadyExists) {
        await document
        .put({
           TableName: 'users_certificates',
           Item: {
               id,
               name,
               grade,
           }
       }).promise();   
    }

    const medalPath = path.join(process.cwd(), 'src', 'templates', 'selo.png');
    const medal = fs.readFileSync(medalPath, 'base64');

    const data: ITamplate = {
        date: dayjs().format('DD/MM/YYYY'),
        grade,
        name,
        id,
        medal
    }

   const content = await compile(data);

   const browser = await chromium.puppeteer.launch({
     headless: true,
     args: chromium.args,
     defaultViewport: chromium.defaultViewport,
     executablePath: await chromium.executablePath
   });

    // Gera o certificado
    // Compilar usando handlebars

    // Transformar em PDF

    // Salvar no S3

   const page = await browser.newPage();

   await page.setContent(content);

   const pdf = await page.pdf({
     format: "a4",
     landscape: true,
     path: process.env.IS_OFFLINE ? "certificate.pdf" : null,
     printBackground: true,
     preferCSSPageSize: true
   })
 
   await browser.close();

   const s3 = new S3();

   await s3
   .putObject({
       Bucket: 'serverlesscertificatelucas',
       Key: `${id}.pdf`,
       ACL: 'public-read',
       Body: pdf,
       ContentType: 'application/pdf'
   })
   .promise();

    return { 
        statusCode: 201,
        body: JSON.stringify({
            message: 'Certificate created',
            url: `https://serverlesscertificatelucas.s3-sa-east-1.amazonaws.com/${id}.pdf`
        }),
        headers: {
            'Content-Type': 'application/json',
        }
    }


}