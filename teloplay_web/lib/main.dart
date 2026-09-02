import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/home_screen.dart';
import 'services/audio_player_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AudioPlayerService().init();
  runApp(const TeloPlayWebApp());
}

class TeloPlayWebApp extends StatelessWidget {
  const TeloPlayWebApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TeloPlay Web - Music Stream',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0C0C12),
        primaryColor: const Color(0xFFFF3B5C),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFFF3B5C),
          secondary: Color(0xFFFF6B8B),
          surface: Color(0xFF14141E),
        ),
        textTheme: GoogleFonts.interTextTheme(
          ThemeData.dark().textTheme,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF0C0C12),
          elevation: 0,
        ),
      ),
      home: const HomeScreen(),
    );
  }
}
