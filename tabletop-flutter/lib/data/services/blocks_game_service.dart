import '../../blocks.blocks.dart';
import 'blocks_api_url.dart';
import 'http_client_factory.dart';

class BlocksGameService {
  BlocksGameService(Blocks blocks)
    : _gameApi = blocks.api,
      _authApi = blocks.authApi;

  BlocksGameService._(this._gameApi, this._authApi);

  factory BlocksGameService.fromEnvironment() {
    const configured = String.fromEnvironment('BLOCKS_API_URL');
    final baseUrl = configured.isNotEmpty ? configured : localBlocksApiUrl();
    final client = BlocksClient(baseUrl: baseUrl, client: createHttpClient());
    return BlocksGameService._(ApiApi(client), AuthApiApi(client));
  }

  final ApiApi _gameApi;
  final AuthApiApi _authApi;

  ApiApi get gameApi => _gameApi;
  AuthApiApi get authApi => _authApi;
}
