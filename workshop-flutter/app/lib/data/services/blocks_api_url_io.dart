import 'dart:io';

String localBlocksApiUrl() {
  final host = Platform.isAndroid ? '10.0.2.2' : 'localhost';
  return 'http://$host:3001/aws-blocks/api';
}
